<?php
declare(strict_types=1);

// Writable content and the login configuration live beside public_html, outside Git deployments.
const PRODUCT_VIEWS = ['folded', 'body', 'pallu', 'blouse'];
const MAX_IMAGE_BYTES = 8388608;
const SETUP_TOKEN_HASH = '786aa5dec82758e715f454d140974623693051431da1579e82ef9f648d356603';

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
$route = $_GET['route'] ?? '';
$dataDir = getenv('TANEE_DATA_DIR') ?: dirname(__DIR__, 2) . '/tanee-data';
$catalogueFile = $dataDir . '/catalogue.json';
$sourceFile = dirname(__DIR__) . '/catalogue.json';
$contentFile = dirname(__DIR__) . '/content.json';
$imageDir = $dataDir . '/images';

function respond(int $status, array $body): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function catalogue(): array {
    global $catalogueFile, $sourceFile, $contentFile;
    $file = is_file($catalogueFile) ? $catalogueFile : $sourceFile;
    $decoded = json_decode((string)file_get_contents($file), true);
    if (!is_array($decoded)) respond(500, ['error' => 'Catalogue storage is unavailable.']);
    if (array_is_list($decoded)) {
        $categories = array_values(array_unique(array_map(fn($p) => (string)($p['family'] ?? ''), $decoded)));
        $content = json_decode((string)file_get_contents($contentFile), true);
        return ['categories' => $categories, 'products' => $decoded, 'banners' => $content['banners'] ?? []];
    }
    return $decoded;
}

function version(array $data): string {
    return hash('sha256', json_encode($data, JSON_UNESCAPED_SLASHES));
}

function input(): array {
    $body = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($body)) respond(400, ['error' => 'Invalid JSON request.']);
    return $body;
}

function startAdminSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('tanee_admin');
    session_set_cookie_params(['httponly' => true, 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'samesite' => 'Strict', 'path' => '/admin']);
    session_start();
}

function requireAdmin(): void {
    startAdminSession();
    if (empty($_SESSION['admin'])) respond(401, ['error' => 'Please sign in.']);
}

function requireCsrf(): void {
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!$sent || !hash_equals((string)($_SESSION['csrf'] ?? ''), $sent)) respond(403, ['error' => 'Session expired. Please reload the admin page.']);
}

function loginAllowed(bool $recordFailure): bool {
    global $dataDir;
    $key = hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $lock = fopen($dataDir . '/login-' . $key . '.json', 'c+');
    if (!$lock || !flock($lock, LOCK_EX)) return false;
    $attempts = json_decode((string)stream_get_contents($lock), true);
    if (!is_array($attempts)) $attempts = [];
    $attempts = array_values(array_filter($attempts, fn($time) => is_int($time) && $time > time() - 900));
    $allowed = count($attempts) < 5;
    if ($recordFailure && $allowed) $attempts[] = time();
    ftruncate($lock, 0); rewind($lock); fwrite($lock, json_encode($attempts)); fflush($lock);
    flock($lock, LOCK_UN); fclose($lock);
    return $allowed;
}

function validImagePath(string $path): bool {
    return (bool)preg_match('~^assets/products/[a-z0-9-]+\.(?:webp|png|jpe?g)$~', $path)
        || (bool)preg_match('~^admin/api\.php\?route=image&name=[a-f0-9]{32}\.(?:webp|png|jpe?g)$~', $path);
}

function validBannerPath(string $path): bool {
    return (bool)preg_match('~^assets/banners/[a-z0-9-]+\.(?:webp|png|jpe?g)$~', $path)
        || (bool)preg_match('~^admin/api\.php\?route=image&name=[a-f0-9]{32}\.(?:webp|png|jpe?g)$~', $path);
}

function validateCatalogue(array $data): array {
    if (!isset($data['categories'], $data['products'], $data['banners']) || !is_array($data['categories']) || !is_array($data['products']) || !is_array($data['banners'])) respond(422, ['error' => 'Categories, products and banners are required.']);
    if (count($data['categories']) > 100 || count($data['products']) > 2000 || count($data['banners']) < 1 || count($data['banners']) > 20) respond(422, ['error' => 'Catalogue size is invalid.']);
    $categories = [];
    foreach ($data['categories'] as $category) {
        if (!is_string($category) || !preg_match('/^[\p{L}\p{N} &-]{1,50}$/u', $category) || in_array($category, $categories, true)) respond(422, ['error' => 'Invalid or duplicate category.']);
        $categories[] = trim($category);
    }
    $products = []; $ids = [];
    foreach ($data['products'] as $product) {
        if (!is_array($product)) respond(422, ['error' => 'Invalid product.']);
        $id = $product['id'] ?? ''; $name = $product['name'] ?? ''; $family = $product['family'] ?? '';
        if (!is_string($id) || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $id) || strlen($id) > 80 || isset($ids[$id])) respond(422, ['error' => 'Invalid or duplicate design code.']);
        if (!is_string($name) || trim($name) === '' || strlen($name) > 300) respond(422, ['error' => 'Product name is missing or too long.']);
        if (!in_array($family, $categories, true)) respond(422, ['error' => 'Every product needs a valid category.']);
        $price = $product['price'] ?? null;
        if ($price !== null && (!is_numeric($price) || (float)$price < 0 || (float)$price > 10000000)) respond(422, ['error' => 'Invalid product price.']);
        $images = $product['images'] ?? null;
        if (!is_array($images) || count($images) === 0) respond(422, ['error' => 'Every product needs an image.']);
        $cleanImages = [];
        foreach ($images as $view => $path) {
            if (!in_array($view, PRODUCT_VIEWS, true) || !is_string($path) || !validImagePath($path)) respond(422, ['error' => 'Invalid product image.']);
            $cleanImages[$view] = $path;
        }
        $ids[$id] = true;
        $products[] = ['id' => $id, 'name' => trim($name), 'family' => $family, 'price' => $price === null ? null : round((float)$price, 2), 'images' => $cleanImages];
    }
    $banners = [];
    foreach ($data['banners'] as $banner) {
        if (!is_array($banner)) respond(422, ['error' => 'Invalid banner.']);
        $clean = [];
        foreach (['label', 'first', 'second', 'description', 'alt'] as $field) {
            $value = $banner[$field] ?? '';
            if (!is_string($value) || trim($value) === '' || strlen($value) > 500) respond(422, ['error' => 'Banner text is missing or too long.']);
            $clean[$field] = trim($value);
        }
        $path = $banner['image'] ?? '';
        if (!is_string($path) || !validBannerPath($path)) respond(422, ['error' => 'Invalid banner image.']);
        $clean['image'] = $path;
        if (!in_array($banner['theme'] ?? '', ['light', 'dark'], true)) respond(422, ['error' => 'Invalid banner theme.']);
        $clean['theme'] = $banner['theme'];
        $banners[] = $clean;
    }
    return ['categories' => $categories, 'products' => $products, 'banners' => $banners];
}

if ($route === 'setup' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'
        || (int)($_SERVER['SERVER_PORT'] ?? 0) === 443;
    if (!$secure) respond(403, ['error' => 'HTTPS is required for setup.']);
    $configFile = $dataDir . '/admin-config.php';
    if (is_file($configFile)) respond(409, ['error' => 'Admin is already configured.']);
    $body = input();
    if (!is_string($body['token'] ?? null) || !hash_equals(SETUP_TOKEN_HASH, hash('sha256', $body['token']))) respond(403, ['error' => 'Invalid setup token.']);
    $username = $body['username'] ?? null; $password = $body['password'] ?? null;
    if (!is_string($username) || !preg_match('/^[a-zA-Z0-9_-]{3,50}$/', $username) || !is_string($password) || strlen($password) < 10 || strlen($password) > 1024) respond(422, ['error' => 'Invalid admin account.']);
    if (!is_dir($dataDir) && !mkdir($dataDir, 0750, true)) respond(500, ['error' => 'Could not create private storage.']);
    $salt = bin2hex(random_bytes(24)); $iterations = 600000;
    $config = ['username' => $username, 'salt' => $salt, 'iterations' => $iterations, 'password_hash' => hash_pbkdf2('sha256', $password, $salt, $iterations, 64)];
    $file = fopen($configFile, 'x');
    if (!$file) respond(409, ['error' => 'Admin is already configured.']);
    $content = "<?php\nreturn " . var_export($config, true) . ";\n";
    $written = fwrite($file, $content); fclose($file);
    if ($written !== strlen($content)) { unlink($configFile); respond(500, ['error' => 'Could not save admin configuration.']); }
    chmod($configFile, 0600);
    respond(200, ['ok' => true]);
}

if ($route === 'public' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    respond(200, catalogue());
}

if ($route === 'image' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $name = $_GET['name'] ?? '';
    if (!is_string($name) || !preg_match('/^[a-f0-9]{32}\.(webp|png|jpe?g)$/', $name, $match)) { http_response_code(404); exit; }
    $path = $imageDir . '/' . $name;
    if (!is_file($path)) { http_response_code(404); exit; }
    header('Content-Type: ' . match ($match[1]) { 'png' => 'image/png', 'jpg', 'jpeg' => 'image/jpeg', default => 'image/webp' });
    header('Cache-Control: public, max-age=31536000, immutable');
    readfile($path); exit;
}

if ($route === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    startAdminSession();
    $configFile = $dataDir . '/admin-config.php';
    if (!is_file($configFile)) respond(503, ['error' => 'Admin login is not configured on this server.']);
    $config = require $configFile;
    if (!is_array($config) || empty($config['password_hash']) || empty($config['salt'])) respond(503, ['error' => 'Admin login is not configured on this server.']);
    $body = input();
    if (!is_string($body['username'] ?? null) || !is_string($body['password'] ?? null) || strlen($body['password']) > 1024) respond(400, ['error' => 'Invalid login request.']);
    if (!loginAllowed(false)) respond(429, ['error' => 'Too many attempts. Try again in 15 minutes.']);
    $candidate = hash_pbkdf2('sha256', $body['password'], (string)$config['salt'], (int)($config['iterations'] ?? 600000), 64);
    $valid = hash_equals((string)($config['username'] ?? ''), $body['username'])
        && hash_equals((string)$config['password_hash'], $candidate);
    if (!$valid) {
        loginAllowed(true);
        respond(401, ['error' => 'Incorrect username or password.']);
    }
    session_regenerate_id(true);
    $_SESSION = ['admin' => true, 'csrf' => bin2hex(random_bytes(32))];
    respond(200, ['csrf' => $_SESSION['csrf']]);
}

if ($route === 'session' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    startAdminSession();
    respond(200, ['authenticated' => !empty($_SESSION['admin']), 'csrf' => !empty($_SESSION['admin']) ? $_SESSION['csrf'] : null]);
}

requireAdmin();

if ($route === 'admin' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $data = catalogue();
    respond(200, ['catalogue' => $data, 'version' => version($data)]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') requireCsrf();

if ($route === 'logout' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $_SESSION = []; session_destroy(); respond(200, ['ok' => true]);
}

if ($route === 'save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    global $dataDir, $catalogueFile;
    $body = input();
    if (!is_dir($dataDir) && !mkdir($dataDir, 0750, true)) respond(500, ['error' => 'Cannot create catalogue storage.']);
    $lock = fopen($dataDir . '/catalogue.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) respond(500, ['error' => 'Cannot lock catalogue storage.']);
    $current = catalogue();
    if (!is_string($body['version'] ?? null) || !hash_equals(version($current), $body['version'])) respond(409, ['error' => 'The catalogue changed elsewhere. Reload before saving.']);
    $clean = validateCatalogue($body['catalogue'] ?? []);
    $json = json_encode($clean, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    $temp = tempnam($dataDir, 'catalogue-');
    if (!$temp || file_put_contents($temp, $json) === false || !rename($temp, $catalogueFile)) respond(500, ['error' => 'Could not save catalogue.']);
    chmod($catalogueFile, 0640);
    flock($lock, LOCK_UN); fclose($lock);
    respond(200, ['version' => version($clean)]);
}

if ($route === 'upload' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (empty($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) respond(422, ['error' => 'Image upload failed.']);
    $file = $_FILES['image'];
    if ($file['size'] > MAX_IMAGE_BYTES) respond(422, ['error' => 'Image must be under 8 MB.']);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $ext = match ($mime) { 'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', default => null };
    if (!$ext || !getimagesize($file['tmp_name'])) respond(422, ['error' => 'Upload a JPG, PNG or WebP image.']);
    if (!is_dir($imageDir) && !mkdir($imageDir, 0750, true)) respond(500, ['error' => 'Cannot create image storage.']);
    $name = bin2hex(random_bytes(16)) . '.' . $ext;
    if (!move_uploaded_file($file['tmp_name'], $imageDir . '/' . $name)) respond(500, ['error' => 'Could not save image.']);
    chmod($imageDir . '/' . $name, 0640);
    respond(200, ['path' => 'admin/api.php?route=image&name=' . $name]);
}

respond(404, ['error' => 'Unknown request.']);
