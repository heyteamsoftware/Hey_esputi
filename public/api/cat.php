<?php
// Esputi · catálogo musical (solo texto): canciones, artistas, álbumes y listas de éxitos
// tomados de la API pública de Deezer. Sirve para que la búsqueda y las fichas de artista
// y álbum sean completas; el audio nunca pasa por aquí y no se guarda nada.
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, max-age=1800');
header('X-Content-Type-Options: nosniff');

const GUARD = "<?php exit; ?>\n";
function out(array $d, int $code = 200): never {
    if ($code !== 200) header('Cache-Control: no-store');
    http_response_code($code);
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Solo estas rutas, con identificadores numéricos
$ROUTES = [
    '#^search$#' => 'tracks', '#^search/artist$#' => 'artists', '#^search/album$#' => 'albums',
    '#^artist/\d{1,12}$#' => 'artist', '#^artist/\d{1,12}/top$#' => 'tracks', '#^artist/\d{1,12}/albums$#' => 'albums',
    '#^artist/\d{1,12}/related$#' => 'artists', '#^artist/\d{1,12}/radio$#' => 'tracks',
    '#^album/\d{1,12}$#' => 'album',
    '#^chart/\d{1,6}/tracks$#' => 'tracks', '#^chart/\d{1,6}/artists$#' => 'artists', '#^chart/\d{1,6}/albums$#' => 'albums',
    // Lo más escuchado ahora mismo en España (lista pública de Apple Music)
    '#^top$#' => 'top',
];
$p = trim((string)($_GET['p'] ?? ''), '/');
$kind = null;
foreach ($ROUTES as $re => $k) if (preg_match($re, $p)) { $kind = $k; break; }
if ($kind === null) out(['error' => 'Ruta no válida'], 400);

$params = [];
if (str_starts_with($p, 'search')) {
    $q = trim((string)($_GET['q'] ?? ''));
    if ($q === '' || mb_strlen($q) > 150) out(['error' => 'Búsqueda no válida'], 400);
    $params['q'] = $q;
}
$params['limit'] = max(1, min(100, (int)($_GET['limit'] ?? 25)));

// Límite por IP: 600 consultas cada 10 minutos
$DATA = dirname(__DIR__) . '/data';
$rlFile = $DATA . '/ratelimit.json.php';
$lk = fopen($DATA . '/.lock', 'c');
flock($lk, LOCK_EX);
$rl = [];
if (is_file($rlFile)) { $rl = json_decode(substr((string)file_get_contents($rlFile), strlen(GUARD)), true) ?: []; }
$now = time(); $key = 'c:' . ($_SERVER['REMOTE_ADDR'] ?? '0');
foreach ($rl as $k => $v) if ($v[1] < $now) unset($rl[$k]);
$e = $rl[$key] ?? [0, $now + 600];
if ($e[0] >= 600) { flock($lk, LOCK_UN); out(['error' => 'Demasiadas consultas. Espera unos minutos.'], 429); }
$e[0]++; $rl[$key] = $e;
file_put_contents($rlFile . '.tmp', GUARD . json_encode($rl)); rename($rlFile . '.tmp', $rlFile);
flock($lk, LOCK_UN);

// Servidor fijo; la ruta ya está validada y los parámetros van codificados
$ctx = stream_context_create(['http' => [
    'method' => 'GET', 'timeout' => 10, 'ignore_errors' => true,
    'header' => "Accept: application/json\r\nAccept-Language: es-ES,es;q=0.9\r\nUser-Agent: Esputi/1.0\r\n",
]]);
$url = $kind === 'top'
    ? 'https://rss.marketingtools.apple.com/api/v2/es/music/most-played/50/songs.json'
    : 'https://api.deezer.com/' . $p . '?' . http_build_query($params);
$raw = @file_get_contents($url, false, $ctx, 0, 3000000);
$j = $raw === false ? null : json_decode($raw, true);
if (!is_array($j) || isset($j['error'])) out(['error' => 'El catálogo no responde'], 502);

$s = fn($v, int $n = 200): string => mb_substr((string)($v ?? ''), 0, $n);
if ($kind === 'top') {
    $items = [];
    foreach (($j['feed']['results'] ?? []) as $t) {
        if (!is_array($t) || ($t['name'] ?? '') === '') continue;
        // Estilo: el primer género que no sea el genérico "Música"
        $genre = '';
        foreach (($t['genres'] ?? []) as $g) { if (($g['genreId'] ?? '') !== '34') { $genre = $s($g['name'] ?? '', 60); break; } }
        $items[] = [
            'id' => preg_replace('/\D/', '', $s($t['id'] ?? '', 20)), 'title' => $s($t['name']), 'artist' => $s($t['artistName'] ?? '', 120),
            'cover' => str_replace('100x100bb', '300x300bb', $s($t['artworkUrl100'] ?? '', 300)), 'genre' => $genre,
        ];
    }
    out(['items' => $items]);
}
$track = function (array $t, ?array $alb = null) use ($s): array {
    $a = $t['album'] ?? $alb ?? [];
    return [
        'id' => (int)($t['id'] ?? 0), 'title' => $s($t['title'] ?? ''), 'artist' => $s($t['artist']['name'] ?? '', 120),
        'artistId' => (int)($t['artist']['id'] ?? 0), 'album' => $s($a['title'] ?? ''), 'albumId' => (int)($a['id'] ?? 0),
        'duration' => (int)($t['duration'] ?? 0), 'cover' => $s($a['cover_medium'] ?? '', 300), 'rank' => (int)($t['rank'] ?? 0),
    ];
};
$artist = fn(array $a): array => [
    'id' => (int)($a['id'] ?? 0), 'name' => $s($a['name'] ?? '', 120), 'cover' => $s($a['picture_medium'] ?? '', 300),
    'big' => $s($a['picture_big'] ?? '', 300), 'fans' => (int)($a['nb_fan'] ?? 0), 'albums' => (int)($a['nb_album'] ?? 0),
];
$album = fn(array $a): array => [
    'id' => (int)($a['id'] ?? 0), 'name' => $s($a['title'] ?? ''), 'artist' => $s($a['artist']['name'] ?? '', 120),
    'artistId' => (int)($a['artist']['id'] ?? 0), 'cover' => $s($a['cover_medium'] ?? '', 300), 'big' => $s($a['cover_big'] ?? '', 300),
    'year' => substr((string)($a['release_date'] ?? ''), 0, 4), 'kind' => $s($a['record_type'] ?? 'album', 20), 'count' => (int)($a['nb_tracks'] ?? 0),
];
$ok = fn(array $x): bool => $x['id'] > 0;

switch ($kind) {
    case 'tracks':  out(['items' => array_values(array_filter(array_map(fn($t) => $track($t), $j['data'] ?? []), $ok))]);
    case 'artists': out(['items' => array_values(array_filter(array_map($artist, $j['data'] ?? []), $ok))]);
    case 'albums':  out(['items' => array_values(array_filter(array_map($album, $j['data'] ?? []), $ok))]);
    case 'artist':  out(['item' => $artist($j)]);
    case 'album':
        $a = $album($j);
        $a['genre'] = $s($j['genres']['data'][0]['name'] ?? '', 60);
        $a['tracks'] = array_values(array_filter(array_map(fn($t) => $track($t, $j), $j['tracks']['data'] ?? []), $ok));
        out(['item' => $a]);
}
