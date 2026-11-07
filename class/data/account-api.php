<?php
/**
 * 金旭的账号 / 跨设备同步云函数（热铁盒 PHP 云函数 + KV 数据库）
 * ---------------------------------------------------------------------------
 * 页面：/class/*（`lib/account.js` 在左上角挂一个头像，点开就是这个接口）
 * 存储：KV 数据库 hw_acc —— 一个人一串键（名字是中文，键里一律用短哈希）：
 *       a-<10 位哈希>  →  客户端那份状态的 **JSON 原文**（原样存、原样吐，见下）
 *       r-<10 位哈希>  →  rev（每存一次 +1）
 *       t-<10 位哈希>  →  存进去的时间 ISO
 *       w-<10 位哈希>  →  上次写入的秒级时间戳（节流用）
 *
 * 动作（POST + JSON body；GET 也认，排障时方便）：
 *   ping   探活
 *   login  姓名 + token → 认了就把云端那份一起带回来（第一次登录 = 注册）
 *   load   只读：令牌对了就把云端那份带回来
 *   save   把合并后的状态写回去（带 rev，服务端 +1 后回最新的）
 *
 * ★ 只有「金旭」的号能登录，token 就是留言板删留言那个口令（用户指定：
 *   不用藏、同学看不懂，真被冒用了全删掉就全删掉）。**服务端校验**，
 *   页面源码里没有 token —— 而 token 一旦写进 JS，右键看源码就看见了。
 *
 * ★ 为什么错误也回 200 + ok:false：
 *   和 msg-api.php 同一个理由 —— GitHub Pages 把 .php 当源码返回、
 *   桌面 / 安卓离线副本一律 404，页面靠「拿不到合法 JSON」判断要不要降级。
 *
 * ★ 值上限 65535 字符：客户端只传「近 60 天的打勾 + 界面偏好」，
 *   这里再兜一层 60000 字节的上限，超了就拒（让客户端先收敛）。
 *
 * ★ 状态**原样存、原样吐**（存字符串、回包时把原文拼进 data 里），不是 decode 再 encode：
 *   PHP 的 json_decode(..., true) 会把 `{}` 变成空数组，再 json_encode 就成了 `[]` ——
 *   客户端的 `{"done":{},"prefs":{}}` 会在往返一次之后变成 `{"done":[],"prefs":[]}`。
 *   这种「形状悄悄漂移」最难查，所以干脆不碰原文。
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

/* ── 配置 ─────────────────────────────────────────────────────────────── */
const DB_NAME     = 'hw_acc';
const ACCOUNT     = '金旭';        /* 账号白名单：只放这一个名字（加人要改这里） */
const ADMIN_TOKEN = '114514';      /* 和 msg-api.php 的删留言口令一致（用户指定） */
const MAX_BYTES   = 60000;         /* 一份状态的上限 */
const COOLDOWN    = 3;             /* 同一个号两次写入至少隔 3 秒 */
const KEEP_REV    = 999999;        /* rev 上限，防溢出 */

/* ── 小工具 ───────────────────────────────────────────────────────────── */
function out($arr){
    echo json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail($msg, $reason){
    out(array('ok' => false, 'error' => $msg, 'reason' => $reason));
}

function clip($s, $max){
    if (is_array($s) || is_object($s)) { return ''; }
    $s = (string)$s;
    if (function_exists('mb_convert_encoding')) {
        $s = @mb_convert_encoding($s, 'UTF-8', 'UTF-8');
    }
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s);
    if ($s === null) { $s = ''; }
    $s = trim($s);
    if (function_exists('mb_substr')) {
        $s = mb_substr($s, 0, $max, 'UTF-8');
    } else {
        $s = substr($s, 0, $max);
    }
    return $s;
}

/* KV 键只能 ASCII，中文名字先哈希 */
function h($s){
    return substr(md5('acc|' . $s), 0, 10);
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
$db = new Database(DB_NAME);

/* ── 校验：姓名 + token ──────────────────────────────────────────────── */
function auth($input){
    $name  = clip(pick('name', $input), 12);
    $token = clip(pick('token', $input), 32);
    if ($name === '')            { fail('先填名字', 'noname'); }
    if ($name !== ACCOUNT)       { fail('只有「' . ACCOUNT . '」的号能登录', 'forbidden'); }
    if ($token === '')           { fail('token 还没填', 'notoken'); }
    if ($token !== ADMIN_TOKEN)  { fail('token 不对 —— 在微信找金旭要', 'badtoken'); }
    return $name;
}

/* 把存着的那串读出来；没有 / 坏了都当 {}（客户端自己会归一） */
function loadState($db, $name){
    $h = h($name);
    $raw = $db->get('a-' . $h);
    $revRaw = $db->get('r-' . $h);
    $atRaw  = $db->get('t-' . $h);
    $rev = (is_string($revRaw) && $revRaw !== '') ? (int)$revRaw : 0;
    $at  = is_string($atRaw) ? $atRaw : '';
    if (!is_string($raw) || $raw === '') { $raw = '{}'; }
    $probe = json_decode($raw, true);
    if (!is_array($probe)) { $raw = '{}'; }
    return array('rev' => $rev, 'at' => $at, 'json' => $raw);
}

/* 回包：data 那一截直接用存着的原文（见文件头的「原样吐」） */
function respondState($name, $st, $fresh){
    echo '{"ok":true,"name":' . json_encode($name, JSON_UNESCAPED_UNICODE)
       . ',"rev":' . (int)$st['rev']
       . ',"at":' . json_encode($st['at'], JSON_UNESCAPED_UNICODE)
       . ',"fresh":' . ($fresh ? 'true' : 'false')
       . ',"data":' . $st['json'] . '}';
    exit;
}

/* ── ping / login / load ─────────────────────────────────────────────── */
if ($action === 'ping') {
    out(array(
        'ok'       => true,
        'service'  => 'hw-account',
        'version'  => 2,
        'account'  => ACCOUNT,
        'maxBytes' => MAX_BYTES,
        'at'       => date('c')
    ));
}

function auth($input){
    $name  = clip(pick('name', $input), 12);
    $token = clip(pick('token', $input), 32);
    if ($name === '')            { fail('先填名字', 'noname'); }
    if ($name !== ACCOUNT)       { fail('只有「' . ACCOUNT . '」的号能登录', 'forbidden'); }
    if ($token === '')           { fail('token 还没填', 'notoken'); }
    if ($token !== ADMIN_TOKEN)  { fail('token 不对 —— 在微信找金旭要', 'badtoken'); }
    return $name;
}

if ($action === 'login' || $action === 'load') {
    $name = auth($input);
    $st = loadState($db, $name);
    respondState($name, $st, $st['rev'] === 0);   /* rev 0 = 还没存过 = 第一次登录（注册） */
}

/* ── save：data 可以是 JSON 字符串，也可以是对象 ─────────────────────── */
if ($action === 'save') {
    $name = auth($input);

    $data = pick('data', $input);
    if (is_array($data)) {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } elseif (is_string($data)) {
        $json = trim($data);
    } else {
        $json = '';
    }
    if (!is_string($json) || $json === '') { fail('data 是空的', 'noshape'); }
    if ($json[0] !== '{') { fail('data 要是一个 JSON 对象', 'noshape'); }
    if (!is_array(json_decode($json, true))) { fail('data 解析不了', 'badjson'); }
    if (strlen($json) > MAX_BYTES) {
        fail('状态太大了（' . strlen($json) . ' 字节，上限 ' . MAX_BYTES . '）', 'toolarge');
    }

    /* 节流：同一个号 3 秒内只让写一次（客户端本来也会防抖，这里兜底） */
    $now = time();
    $h = h($name);
    $wKey = 'w-' . $h;
    $lastRaw = $db->get($wKey);
    if (is_string($lastRaw) && $lastRaw !== '') {
        $last = (int)$lastRaw;
        if ($last > 0 && $now - $last < COOLDOWN) {
            fail('写得太快了，等 ' . (COOLDOWN - ($now - $last)) . ' 秒', 'cooldown');
        }
    }

    $st = loadState($db, $name);
    $rev = $st['rev'] + 1;
    if ($rev > KEEP_REV) { $rev = 1; }
    $at = date('c');

    $db->set('a-' . $h, $json);
    $db->set('r-' . $h, (string)$rev);
    $db->set('t-' . $h, $at);
    $db->set($wKey, (string)$now);

    out(array('ok' => true, 'name' => $name, 'rev' => $rev, 'at' => $at, 'bytes' => strlen($json)));
}

out(array('ok' => false, 'error' => 'unknown action', 'reason' => 'action'));
