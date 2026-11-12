<?php
// Esputi · busca vídeos en YouTube (solo texto: id, título, canal, duración) para que
// el navegador los reproduzca con el reproductor oficial incrustado. No guarda nada.
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, max-age=3600');
header('X-Content-Type-Options: nosniff');

const GUARD = "<?php exit; ?>\n";
function out(array $d, int $code = 200): never {
    if ($code !== 200) header('Cache-Control: no-store');
    http_response_code($code);
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$q = trim((string)($_GET['q'] ?? ''));
if ($q === '' || mb_strlen($q) > 150) out(['error' => 'Búsqueda no válida'], 400);

// Límite por IP: 400 búsquedas cada 10 minutos (una playlist larga necesita una por canción)
$DATA = dirname(__DIR__) . '/data';
$rlFile = $DATA . '/ratelimit.json.php';
$lk = fopen($DATA . '/.lock', 'c');
flock($lk, LOCK_EX);
$rl = [];
if (is_file($rlFile)) { $rl = json_decode(substr((string)file_get_contents($rlFile), strlen(GUARD)), true) ?: []; }
$now = time(); $key = 'y:' . ($_SERVER['REMOTE_ADDR'] ?? '0');
foreach ($rl as $k => $v) if ($v[1] < $now) unset($rl[$k]);
$e = $rl[$key] ?? [0, $now + 600];
if ($e[0] >= 400) out(['error' => 'Demasiadas búsquedas. Espera unos minutos.'], 429);
$e[0]++; $rl[$key] = $e;
file_put_contents($rlFile . '.tmp', GUARD . json_encode($rl)); rename($rlFile . '.tmp', $rlFile);
flock($lk, LOCK_UN);

// URL fija; lo único variable es el texto de búsqueda, codificado. sp=EgIQAQ== → solo vídeos
$ctx = stream_context_create(['http' => [
    'method' => 'GET', 'timeout' => 12, 'ignore_errors' => true,
    'header' => "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36\r\n"
              . "Accept-Language: es-ES,es;q=0.9\r\nCookie: SOCS=CAI; CONSENT=YES+1\r\n",
]]);
$html = @file_get_contents('https://www.youtube.com/results?search_query=' . rawurlencode($q) . '&sp=EgIQAQ%253D%253D', false, $ctx, 0, 4000000);
if ($html === false || !preg_match('#var ytInitialData = (\{.*?\});</script>#s', $html, $m)) out(['error' => 'YouTube no responde'], 502);
$j = json_decode($m[1], true);
$secs = $j['contents']['twoColumnSearchResultsRenderer']['primaryContents']['sectionListRenderer']['contents'] ?? [];

$secsOf = function (string $t): int { // "1:02:03" → segundos
    $n = 0; foreach (explode(':', $t) as $p) $n = $n * 60 + (int)$p; return $n;
};
$items = [];
foreach ($secs as $s) {
    foreach (($s['itemSectionRenderer']['contents'] ?? []) as $it) {
        $v = $it['videoRenderer'] ?? null;
        if (!$v || empty($v['videoId']) || empty($v['lengthText']['simpleText'])) continue; // sin duración = directo
        if (!preg_match('/^[A-Za-z0-9_-]{11}$/', (string)$v['videoId'])) continue;
        $items[] = [
            'sid' => $v['videoId'],
            'title' => mb_substr((string)($v['title']['runs'][0]['text'] ?? ''), 0, 200),
            'artist' => mb_substr((string)($v['ownerText']['runs'][0]['text'] ?? ''), 0, 100),
            'duration' => $secsOf((string)$v['lengthText']['simpleText']),
            'cover' => 'https://i.ytimg.com/vi/' . $v['videoId'] . '/mqdefault.jpg',
        ];
        if (count($items) >= 10) break 2;
    }
}
out(['items' => $items]);
