<?php
// Esputi · mini-API de usuarios.
// Guarda SOLO texto: usuarios (nombre + animal cifrado) y su biblioteca
// (listas y favoritos como metadatos). Nunca audio.
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const GUARD = "<?php exit; ?>\n";
const ANIMALS = ['perro','gato','zorro','oso','panda','koala','tigre','leon','vaca','cerdo','rana','mono',
    'pollito','pinguino','buho','unicornio','abeja','mariposa','tortuga','pulpo','delfin','ballena','tiburon','dinosaurio'];
const MAX_LIB_BYTES = 700000;
const MAX_USERS = 5000;

$DATA = dirname(__DIR__) . '/data';
if (!is_dir($DATA)) { @mkdir($DATA, 0770, true); }

function out(array $d, int $code = 200): never {
    http_response_code($code);
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function rd(string $f): array {
    if (!is_file($f)) return [];
    $s = (string)file_get_contents($f);
    if (str_starts_with($s, GUARD)) $s = substr($s, strlen(GUARD));
    $j = json_decode($s, true);
    return is_array($j) ? $j : [];
}
function wr(string $f, array $d): void {
    $tmp = $f . '.tmp';
    file_put_contents($tmp, GUARD . json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    rename($tmp, $f);
}
function ukey(string $name): string { return mb_strtolower(trim($name), 'UTF-8'); }
function valid_name(string $n): bool { return (bool)preg_match('/^[\p{L}\p{N} _.\-]{2,20}$/u', $n); }

// Petición
$in = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = (string)file_get_contents('php://input', false, null, 0, MAX_LIB_BYTES + 5000);
    $in = json_decode($raw, true);
    if (!is_array($in)) out(['error' => 'Petición no válida'], 400);
    // Solo se aceptan peticiones desde la propia web
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        $h = parse_url($origin, PHP_URL_HOST);
        $self = explode(':', $_SERVER['HTTP_HOST'] ?? '')[0];
        if ($h !== $self && !in_array($h, ['localhost', '127.0.0.1'], true)) out(['error' => 'Origen no permitido'], 403);
    }
}
$a = (string)($_GET['a'] ?? $in['a'] ?? '');
$ip = $_SERVER['REMOTE_ADDR'] ?? '0';

// Bloqueo global: las operaciones son diminutas
$lk = fopen($DATA . '/.lock', 'c');
flock($lk, LOCK_EX);

$usersFile = $DATA . '/users.json.php';
$rlFile = $DATA . '/ratelimit.json.php';

function rate(string $file, string $key, int $max, int $window): void {
    $rl = rd($file); $now = time();
    foreach ($rl as $k => $v) if ($v[1] < $now) unset($rl[$k]);
    $e = $rl[$key] ?? [0, $now + $window];
    if ($e[0] >= $max) out(['error' => 'Demasiados intentos. Espera unos minutos.'], 429);
    $e[0]++; $rl[$key] = $e; wr($file, $rl);
}
function rate_clear(string $file, string $key): void {
    $rl = rd($file); unset($rl[$key]); wr($file, $rl);
}
function new_token(array &$u): string {
    $t = bin2hex(random_bytes(24));
    $u['tokens'][] = hash('sha256', $t);
    $u['tokens'] = array_slice($u['tokens'], -8);
    return $t;
}
function auth(array $users, array $in): string {
    $k = ukey((string)($in['name'] ?? ''));
    $t = hash('sha256', (string)($in['token'] ?? ''));
    if (!isset($users[$k]) || !in_array($t, $users[$k]['tokens'] ?? [], true)) out(['error' => 'Sesión caducada'], 401);
    return $k;
}

switch ($a) {
    case 'search': {
        $q = ukey((string)($_GET['q'] ?? ''));
        if (mb_strlen($q) < 2) out(['users' => [], 'exact' => false]);
        rate($rlFile, 's:' . $ip, 120, 60);
        $users = rd($usersFile); $res = [];
        foreach ($users as $k => $u) {
            if (str_starts_with($k, $q)) { $res[] = $u['name']; if (count($res) >= 6) break; }
        }
        out(['users' => $res, 'exact' => isset($users[$q])]);
    }
    case 'register': {
        $name = trim((string)($in['name'] ?? '')); $animal = (string)($in['animal'] ?? '');
        if (!valid_name($name)) out(['error' => 'El nombre debe tener entre 2 y 20 letras o números'], 400);
        if (!in_array($animal, ANIMALS, true)) out(['error' => 'Elige un animal'], 400);
        if (!empty($in['web'])) out(['error' => 'No permitido'], 400); // honeypot anti-bots
        $users = rd($usersFile); $k = ukey($name);
        if (isset($users[$k])) out(['error' => 'Ese nombre ya existe'], 409);
        if (count($users) >= MAX_USERS) out(['error' => 'Registro cerrado temporalmente'], 503);
        rate($rlFile, 'r:' . $ip, 8, 3600);
        $u = ['name' => $name, 'hash' => password_hash($animal, PASSWORD_DEFAULT), 'tokens' => [], 'created' => date('c')];
        $token = new_token($u);
        $users[$k] = $u; wr($usersFile, $users);
        out(['ok' => true, 'name' => $name, 'token' => $token]);
    }
    case 'login': {
        $k = ukey((string)($in['name'] ?? '')); $animal = (string)($in['animal'] ?? '');
        $users = rd($usersFile);
        if (!isset($users[$k])) out(['error' => 'Ese usuario no existe'], 404);
        rate($rlFile, 'l:' . $ip . ':' . $k, 5, 600);
        if (!password_verify($animal, $users[$k]['hash'])) out(['error' => 'Ese no es tu animal'], 401);
        rate_clear($rlFile, 'l:' . $ip . ':' . $k);
        $token = new_token($users[$k]); wr($usersFile, $users);
        out(['ok' => true, 'name' => $users[$k]['name'], 'token' => $token]);
    }
    case 'getlib': {
        $users = rd($usersFile); $k = auth($users, $in);
        $f = $DATA . '/lib_' . sha1($k) . '.json.php';
        $lib = rd($f);
        out(['ok' => true, 'library' => $lib ?: null]);
    }
    case 'setlib': {
        $users = rd($usersFile); $k = auth($users, $in);
        $lib = $in['library'] ?? null;
        if (!is_array($lib)) out(['error' => 'Biblioteca no válida'], 400);
        if (strlen(json_encode($lib)) > MAX_LIB_BYTES) out(['error' => 'Biblioteca demasiado grande'], 413);
        wr($DATA . '/lib_' . sha1($k) . '.json.php', $lib);
        out(['ok' => true]);
    }
    case 'logout': {
        $users = rd($usersFile); $k = auth($users, $in);
        $t = hash('sha256', (string)$in['token']);
        $users[$k]['tokens'] = array_values(array_diff($users[$k]['tokens'], [$t]));
        wr($usersFile, $users);
        out(['ok' => true]);
    }
    case 'visit': {
        $f = $DATA . '/visits.json.php';
        $v = rd($f); $n = (int)($v['n'] ?? 0);
        if (($_GET['hit'] ?? '') === '1') { $n++; wr($f, ['n' => $n]); }
        out(['visits' => $n]);
    }
    default:
        out(['error' => 'Acción desconocida'], 400);
}
