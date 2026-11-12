<?php
// Esputi · lee los datos públicos de una playlist, un álbum o una canción de Spotify a partir
// de su ID (los mismos que muestra el widget oficial para incrustar). Solo texto y de paso:
// no se guarda nada en el servidor.
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const GUARD = "<?php exit; ?>\n";
function out(array $d, int $code = 200): never {
    http_response_code($code);
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$id = (string)($_GET['id'] ?? '');
$type = (string)($_GET['type'] ?? 'playlist');
if (!in_array($type, ['playlist', 'album', 'track'], true)) out(['error' => 'Tipo de enlace no válido'], 400);
if (!preg_match('/^[A-Za-z0-9]{22}$/', $id)) out(['error' => 'Enlace de Spotify no válido'], 400);
$missing = ['playlist' => 'Playlist no encontrada o privada', 'album' => 'Álbum no encontrado', 'track' => 'Canción no encontrada'][$type];

// Límite por IP: 40 lecturas cada 5 minutos
$DATA = dirname(__DIR__) . '/data';
$rlFile = $DATA . '/ratelimit.json.php';
$lk = fopen($DATA . '/.lock', 'c');
flock($lk, LOCK_EX);
$rl = [];
if (is_file($rlFile)) { $rl = json_decode(substr((string)file_get_contents($rlFile), strlen(GUARD)), true) ?: []; }
$now = time(); $key = 'p:' . ($_SERVER['REMOTE_ADDR'] ?? '0');
foreach ($rl as $k => $v) if ($v[1] < $now) unset($rl[$k]);
$e = $rl[$key] ?? [0, $now + 300];
if ($e[0] >= 40) out(['error' => 'Demasiadas peticiones. Espera unos minutos.'], 429);
$e[0]++; $rl[$key] = $e;
file_put_contents($rlFile . '.tmp', GUARD . json_encode($rl)); rename($rlFile . '.tmp', $rlFile);
flock($lk, LOCK_UN);

// La URL es fija: los únicos datos variables son el tipo y el ID, ya validados
$ctx = stream_context_create(['http' => [
    'method' => 'GET', 'timeout' => 12, 'ignore_errors' => true,
    'header' => "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36\r\nAccept-Language: es\r\n",
]]);
$html = @file_get_contents('https://open.spotify.com/embed/' . $type . '/' . $id, false, $ctx, 0, 3000000);
if ($html === false || $html === '') out(['error' => 'No se pudo contactar con Spotify'], 502);
if (!preg_match('#<script id="__NEXT_DATA__" type="application/json">(.*?)</script>#s', $html, $m)) out(['error' => $missing], 404);
$j = json_decode($m[1], true);
$ent = $j['props']['pageProps']['state']['data']['entity'] ?? null;
if (!is_array($ent)) out(['error' => $missing], 404);
$image = (string)($ent['coverArt']['sources'][0]['url'] ?? $ent['visualIdentity']['image'][0]['url'] ?? '');
$sidOf = fn(array $t): string => substr(strrchr((string)($t['uri'] ?? ''), ':') ?: '', 1);

// Canción suelta: no trae lista, es ella misma
if ($type === 'track') {
    $names = array_map(fn($a) => (string)($a['name'] ?? ''), is_array($ent['artists'] ?? null) ? $ent['artists'] : []);
    $sid = $sidOf($ent);
    if ($sid === '' || empty($ent['title'])) out(['error' => $missing], 404);
    out(['kind' => 'track', 'track' => [
        'sid' => $sid,
        'title' => mb_substr((string)$ent['title'], 0, 200),
        'artist' => mb_substr(implode(', ', array_filter($names)), 0, 200),
        'album' => '', 'cover' => $image,
        'duration' => (int)round(((int)($ent['duration'] ?? 0)) / 1000),
    ]]);
}
if (!isset($ent['trackList'])) out(['error' => $missing], 404);

$items = []; $ids = '';
foreach ($ent['trackList'] as $t) {
    if (($t['entityType'] ?? 'track') !== 'track') continue;
    $sid = $sidOf($t);
    if ($sid === '' || empty($t['title'])) continue;
    $items[] = [
        'sid' => $sid,
        'title' => mb_substr((string)$t['title'], 0, 200),
        'artist' => mb_substr((string)($t['subtitle'] ?? ''), 0, 200),
        'album' => $type === 'album' ? mb_substr((string)($ent['name'] ?? ''), 0, 200) : '',
        'cover' => $type === 'album' ? $image : '',
        'duration' => (int)round(((int)($t['duration'] ?? 0)) / 1000),
    ];
    $ids .= $sid . ',';
}

out([
    'id' => $id,
    'kind' => $type,
    'name' => mb_substr((string)($ent['name'] ?? $ent['title'] ?? 'Lista de Spotify'), 0, 200),
    'description' => '',
    'owner' => mb_substr((string)($ent['subtitle'] ?? 'Spotify'), 0, 100),
    'image' => $image,
    'snapshot' => 'pub:' . sha1($ids),   // cambia cuando se añaden, quitan o reordenan canciones
    'items' => $items,
]);
