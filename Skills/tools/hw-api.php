<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$db = new Database('hw_stats');

/* 云函数数据库键名只允许 ASCII，做一层清洗 */
function safe($s){
    return preg_replace('/[^A-Za-z0-9_\-]/', '', (string)$s);
}

/* 合并 GET 与 JSON body */
$input = [];
$raw = file_get_contents('php://input');
if ($raw) {
    $parsed = json_decode($raw, true);
    if (is_array($parsed)) $input = $parsed;
}

$pick = function($k) use ($input) {
    if (isset($_GET[$k]))    return $_GET[$k];
    if (isset($input[$k]))   return $input[$k];
    return '';
};

$action = (string)$pick('action');
$id     = safe($pick('id'));
$uid    = safe($pick('uid'));
$total  = (int)$pick('total');
if ($total < 0) $total = 0;

if ($id === '' || $uid === '') {
    echo json_encode(['ok' => false, 'error' => 'missing id or uid']);
    exit;
}

/* 每个用户一条记录：u_<id>_<uid> → JSON 数组（该用户勾选的题目哈希） */
function keyOf($id, $uid){ return 'u_' . $id . '_' . $uid; }

function getUser($db, $id, $uid){
    $raw = $db->get(keyOf($id, $uid));
    if ($raw === null || $raw === false || $raw === '') return [];
    $arr = json_decode($raw, true);
    return is_array($arr) ? $arr : [];
}

function setUser($db, $id, $uid, $arr){
    // 只留 8 位十六进制哈希，去重
    $clean = [];
    foreach ((array)$arr as $h) {
        if (is_string($h) && preg_match('/^[0-9a-f]{8}$/', $h)) {
            $clean[$h] = true;
        }
    }
    $clean = array_keys($clean);
    $db->set(keyOf($id, $uid), json_encode($clean));
    return $clean;
}

/* 遍历同一 id 下所有用户，聚合成 items / people / marks / finished */
function aggregate($db, $id, $total){
    $prefix = 'u_' . $id . '_';
    $keys   = $db->list_keys();

    $items    = [];
    $people   = 0;
    $marks    = 0;
    $finished = 0;

    if (is_array($keys)) {
        foreach ($keys as $k) {
            if (strpos($k, $prefix) !== 0) continue;

            $raw = $db->get($k);
            if ($raw === null || $raw === false || $raw === '') continue;

            $arr = json_decode($raw, true);
            if (!is_array($arr) || !$arr) continue;

            $people++;
            $marks += count($arr);
            if ($total > 0 && count($arr) >= $total) $finished++;

            foreach ($arr as $h) {
                $items[$h] = isset($items[$h]) ? $items[$h] + 1 : 1;
            }
        }
    }

    return [
        'ok'       => true,
        'people'   => $people,
        'marks'    => $marks,
        'finished' => $finished,
        'items'    => $items,   // { 哈希: 完成人数 }
    ];
}

/* ── stats：拉取全班统计 + 我的记录 ── */
if ($action === 'stats') {
    $agg = aggregate($db, $id, $total);
    $agg['mine'] = getUser($db, $id, $uid);
    echo json_encode($agg);
    exit;
}

/* ── sync：提交我的勾选，返回最新全班统计 ── */
if ($action === 'sync') {
    $done = isset($input['done']) && is_array($input['done']) ? $input['done'] : [];
    $mine = setUser($db, $id, $uid, $done);

    $agg = aggregate($db, $id, $total);
    $agg['mine'] = $mine;
    echo json_encode($agg);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'unknown action']);