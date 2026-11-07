<?php
/**
 * 作业留言板云函数（热铁盒 PHP 云函数 + KV 数据库）
 * ---------------------------------------------------------------------------
 * 页面：/class/homework.html 里那张「留言板」
 * 存储：KV 数据库 hw_msg —— 一条留言一个键，键里带日期和秒级时间戳，天生可排序：
 *       m-<date>-<11 位秒级时间戳>-<6 位随机十六进制>  →  {"n":"名字","t":"正文","at":"ISO 时间"}
 *
 * 动作（都走 POST + JSON body，GET 参数也认）：
 *   list  拉某一天的留言（新的在前，最多 100 条）
 *   post  发一条（校验名单 / 长度 / 同一人 20 秒冷却 / 每人每天 40 条上限）
 *   del   删一条（只有「金旭」+ 管理口令能干，见 ADMIN / ADMIN_TOKEN）
 *   ping  探活（部署自检用）
 *
 * ★ 为什么每个动作都回 ok:true 而不是 HTTP 500：
 *   页面在热铁盒上拿真 JSON；在 GitHub Pages 上 .php 会被当**源码**返回（text/plain），
 *   在桌面 / 安卓的离线副本里 .php 直接 404 —— 页面靠「拿不到合法 JSON」来判断该降级到
 *   「本机留言」。所以这里永远回一段能解析的 JSON，错误也塞进 ok:false。
 *
 * ★ 键名只能 ASCII：[A-Za-z0-9_-]（热铁盒 KV 的规定），中文名字一律 md5 之后再当键。
 * ★ 值上限 65535 字符：正文截到 160 字，离上限很远。
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

/* ── 配置 ─────────────────────────────────────────────────────────────── */
const DB_NAME     = 'hw_msg';
const ROSTER_FILE = 'class/data/roster.json';   /* 相对站点根，别写开头的斜杠 */
const MAX_TEXT    = 160;    /* 页面上限 120，这里留一点余量 */
const MAX_NAME    = 12;
const COOLDOWN    = 20;     /* 同一个人两条留言之间至少 20 秒 */
const DAY_CAP     = 40;     /* 同一个人一天最多 40 条 */
const KEEP_MAX    = 600;    /* 全库上限，超了从最旧的删 */
const LIST_MAX    = 100;    /* 一次最多回 100 条 */
const ADMIN       = '金旭';  /* 唯一能删留言的人（用户指定） */
const ADMIN_TOKEN = '114514'; /* 用户原话：不用藏，同学看不懂，黑客要删就全删了得了 */

/* ── 小工具 ───────────────────────────────────────────────────────────── */
function out($arr){
    echo json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail($msg, $reason){
    out(array('ok' => false, 'error' => $msg, 'reason' => $reason));
}

/* 去控制字符、压空白、截断；没有 mbstring 就用 substr 兜底 */
function clip($s, $max){
    if (is_array($s) || is_object($s)) { return ''; }   /* name[]=x 这类捣乱参数直接丢掉 */
    $s = (string)$s;
    if (function_exists('mb_convert_encoding')) {
        $s = @mb_convert_encoding($s, 'UTF-8', 'UTF-8');
    }
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s);
    if ($s === null) { $s = ''; }
    $s = trim(preg_replace('/[\s\x{3000}]+/u', ' ', $s));
    if (function_exists('mb_substr')) {
        $s = mb_substr($s, 0, $max, 'UTF-8');
    } else {
        $s = substr($s, 0, $max);
    }
    return $s;
}

/* KV 键用的短哈希（中文名当键不合法） */
function h($s){
    return substr(md5('811|' . $s), 0, 10);
}

/* 名单：读一次，读不到就返回 null（下面按「放行但只截长度」处理，页面另标 roster:false） */
function roster(){
    static $cache = false;
    if ($cache !== false) { return $cache; }
    $cache = null;
    $raw = @file_get_contents(ROSTER_FILE);
    if (is_string($raw) && $raw !== '') {
        $json = json_decode($raw, true);
        if (is_array($json) && isset($json['names']) && is_array($json['names'])) {
            $list = array();
            foreach ($json['names'] as $n) {
                if (is_string($n) && $n !== '') { $list[$n] = true; }
            }
            $cache = $list;
        }
    }
    return $cache;
}

function badDate($d){
    return !is_string($d) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $d);
}

/* ── 请求参数：GET + JSON body + 表单都认 ─────────────────────────────── */
$input = array();
$rawBody = @file_get_contents('php://input');
if (is_string($rawBody) && $rawBody !== '') {
    $parsed = json_decode($rawBody, true);
    if (is_array($parsed)) { $input = $parsed; }
}

function pick($key, $input){
    if (isset($_GET[$key]))  { return $_GET[$key]; }
    if (isset($_POST[$key])) { return $_POST[$key]; }
    if (isset($input[$key])) { return $input[$key]; }
    return '';
}

$action = (string)pick('action', $input);
$date   = (string)pick('date', $input);

if ($action !== 'ping' && badDate($date)) {
    fail('date 必须是 YYYY-MM-DD', 'baddate');
}

$db = new Database(DB_NAME);

/* ── 读某一天的全部留言 ──────────────────────────────────────────────── */
function readDay($db, $date){
    $prefix = 'm-' . $date . '-';
    $keys = $db->list_keys();
    $mine = array();
    if (is_array($keys)) {
        foreach ($keys as $k) {
            if (is_string($k) && strpos($k, $prefix) === 0) { $mine[] = $k; }
        }
    }
    rsort($mine);                                  /* 时间戳在键里，倒序 = 新的在前 */
    $total = count($mine);
    $mine  = array_slice($mine, 0, LIST_MAX);

    $items = array();
    foreach ($mine as $k) {
        $raw = $db->get($k);
        if (!is_string($raw) || $raw === '') { continue; }
        $o = json_decode($raw, true);
        if (!is_array($o)) { continue; }
        $items[] = array(
            'id' => $k,
            'n'  => isset($o['n']) ? (string)$o['n'] : '',
            't'  => isset($o['t']) ? (string)$o['t'] : '',
            'at' => isset($o['at']) ? (string)$o['at'] : ''
        );
    }
    return array($items, $total);
}

function packList($db, $date){
    list($items, $total) = readDay($db, $date);
    $map = roster();
    return array(
        'ok'     => true,
        'mode'   => 'cloud',
        'date'   => $date,
        'items'  => $items,
        'total'  => $total,
        'roster' => $map !== null,
        'limits' => array(
            'text'     => MAX_TEXT,
            'cooldown' => COOLDOWN,
            'dayCap'   => DAY_CAP,
            'listMax'  => LIST_MAX
        )
    );
}

/* ── 全库上限：避免有人一个晚上把 KV 写满 ────────────────────────────── */
function prune($db){
    $keys = $db->list_keys();
    if (!is_array($keys)) { return; }
    $msgs = array();
    foreach ($keys as $k) {
        if (is_string($k) && strpos($k, 'm-') === 0) { $msgs[] = $k; }
    }
    $n = count($msgs);
    if ($n <= KEEP_MAX) { return; }
    sort($msgs);                                   /* 字典序 = 时间序（键里是定宽时间戳） */
    $drop = $n - KEEP_MAX + 20;                    /* 一次多清 20 条，别每次都清 */
    for ($i = 0; $i < $drop && $i < $n; $i++) {
        $db->delete($msgs[$i]);
    }
}

/* ── ping：部署自检用 ────────────────────────────────────────────────── */
if ($action === 'ping') {
    $keys = $db->list_keys();
    out(array(
        'ok'      => true,
        'service' => 'hw-msg',
        'version' => 1,
        'keys'    => is_array($keys) ? count($keys) : 0,
        'roster'  => roster() !== null,
        'at'      => date('c')
    ));
}

/* ── list ────────────────────────────────────────────────────────────── */
if ($action === 'list') {
    out(packList($db, $date));
}

/* ── post ────────────────────────────────────────────────────────────── */
if ($action === 'post') {
    $name = clip(pick('name', $input), MAX_NAME);
    $text = clip(pick('text', $input), MAX_TEXT);

    if ($name === '') { fail('先选你是哪位同学', 'noname'); }
    if ($text === '') { fail('留言是空的', 'empty'); }

    $map = roster();
    if ($map !== null && !isset($map[$name])) {
        fail('名单里没有「' . $name . '」', 'badname');
    }

    $who  = h($name);
    $now  = time();

    /* 同一个人 20 秒冷却 */
    $lastRaw = $db->get('r-' . $who);
    if (is_string($lastRaw) && $lastRaw !== '') {
        $last = (int)$lastRaw;
        if ($last > 0 && $now - $last < COOLDOWN) {
            fail('刚发过，等 ' . (COOLDOWN - ($now - $last)) . ' 秒再来', 'cooldown');
        }
    }

    /* 每人每天上限 */
    $capKey = 'c-' . $date . '-' . $who;
    $capRaw = $db->get($capKey);
    $cap    = is_string($capRaw) ? (int)$capRaw : 0;
    if ($cap >= DAY_CAP) {
        fail('今天发得太多了（上限 ' . DAY_CAP . ' 条）', 'cap');
    }

    $key = 'm-' . $date . '-' . sprintf('%011d', $now) . '-' . substr(md5(uniqid('', true)), 0, 6);

    /* 同一秒连着发两条时再加一次随机后缀，避免撞键 */
    $exists = $db->get($key);
    if (is_string($exists) && $exists !== '') {
        $key .= '-' . substr(md5(microtime(true) . mt_rand()), 0, 4);
    }

    $db->set($key, json_encode(
        array('n' => $name, 't' => $text, 'at' => date('c')),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    ));

    $db->set('r-' . $who, (string)$now);
    $db->set($capKey, (string)($cap + 1));
    prune($db);

    $pack = packList($db, $date);
    $pack['mine'] = $key;
    out($pack);
}

/* ── del：只有 ADMIN + 口令能删 ──────────────────────────────────────── */
if ($action === 'del') {
    $name  = clip(pick('name', $input), MAX_NAME);
    $token = clip(pick('token', $input), 32);
    $id    = (string)pick('id', $input);

    if ($name !== ADMIN) { fail('只有 ' . ADMIN . ' 能删留言', 'forbidden'); }
    if ($token !== ADMIN_TOKEN) { fail('口令不对', 'badtoken'); }
    if (!preg_match('/^m-\d{4}-\d{2}-\d{2}-\d{11}-[0-9a-f]{6}(-[0-9a-f]{4})?$/', $id)) {
        fail('id 不对', 'badid');
    }

    $db->delete($id);

    /* 删掉的可能是被删那天之外的日期？不，键里就带着日期，按它回列表 */
    $d = substr($id, 2, 10);
    if (badDate($d)) { $d = $date; }
    out(packList($db, $d));
}

out(array('ok' => false, 'error' => 'unknown action', 'reason' => 'action'));
