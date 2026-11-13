<?php
// Esputi · panel de administración: ver y borrar usuarios registrados.
// La contraseña NO está en el código: su hash vive en data/admin.json.php (se crea al desplegar).
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex');

const GUARD = "<?php exit; ?>\n";
$DATA = dirname(__DIR__) . '/data';

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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'Método no permitido'], 405);
$in = json_decode((string)file_get_contents('php://input', false, null, 0, 4000), true);
if (!is_array($in)) out(['error' => 'Petición no válida'], 400);

// Solo desde la propia web (protección CSRF junto con la cookie SameSite=Strict)
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$self = explode(':', $_SERVER['HTTP_HOST'] ?? '')[0];
if ($origin === '' || parse_url($origin, PHP_URL_HOST) !== $self) out(['error' => 'Origen no permitido'], 403);

session_name('esputi_admin');
session_set_cookie_params(['lifetime' => 0, 'path' => '/esputi/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
session_start();

$a = (string)($in['a'] ?? '');
$ip = $_SERVER['REMOTE_ADDR'] ?? '0';
$lk = fopen($DATA . '/.lock', 'c');
flock($lk, LOCK_EX);
$usersFile = $DATA . '/users.json.php';
$rlFile = $DATA . '/ratelimit.json.php';

if ($a === 'login') {
    $rl = rd($rlFile); $now = time(); $key = 'a:' . $ip;
    foreach ($rl as $k => $v) if ($v[1] < $now) unset($rl[$k]);
    $e = $rl[$key] ?? [0, $now + 900];
    if ($e[0] >= 5) out(['error' => 'Demasiados intentos. Espera 15 minutos.'], 429);
    $hash = rd($DATA . '/admin.json.php')['hash'] ?? '';
    if ($hash === '' || !password_verify((string)($in['password'] ?? ''), $hash)) {
        $e[0]++; $rl[$key] = $e; wr($rlFile, $rl);
        usleep(400000);
        out(['error' => 'Contraseña incorrecta'], 401);
    }
    unset($rl[$key]); wr($rlFile, $rl);
    session_regenerate_id(true);
    $_SESSION['admin'] = true;
    $_SESSION['t'] = time();
    out(['ok' => true]);
}

// A partir de aquí hace falta sesión de administrador (caduca a las 2 horas)
if (empty($_SESSION['admin']) || time() - (int)($_SESSION['t'] ?? 0) > 7200) {
    $_SESSION = [];
    out(['error' => 'Inicia sesión'], 401);
}

switch ($a) {
    case 'list': {
        $users = rd($usersFile); $res = [];
        foreach ($users as $k => $u) {
            $lib = rd($DATA . '/lib_' . sha1((string)$k) . '.json.php');
            $res[] = [
                'name' => $u['name'],
                'created' => $u['created'] ?? '',
                'client' => $u['client'] ?? '',
                'seen' => $u['seen'] ?? '',
                'liked' => count($lib['liked'] ?? []),
                'playlists' => count($lib['playlists'] ?? []),
                'spotify' => count($lib['spotify'] ?? []),
                'updated' => isset($lib['updatedAt']) ? date('c', (int)($lib['updatedAt'] / 1000)) : '',
            ];
        }
        usort($res, fn($x, $y) => strcmp($y['created'], $x['created']));
        $visits = (int)(rd($DATA . '/visits.json.php')['n'] ?? 0);
        out(['ok' => true, 'users' => $res, 'visits' => $visits]);
    }
    case 'delete': {
        $k = mb_strtolower(trim((string)($in['name'] ?? '')), 'UTF-8');
        $users = rd($usersFile);
        if (!isset($users[$k])) out(['error' => 'Ese usuario no existe'], 404);
        unset($users[$k]); wr($usersFile, $users);
        @unlink($DATA . '/lib_' . sha1($k) . '.json.php');
        out(['ok' => true]);
    }
    case 'logout': {
        $_SESSION = []; session_destroy();
        out(['ok' => true]);
    }
    default:
        out(['error' => 'Acción desconocida'], 400);
}
