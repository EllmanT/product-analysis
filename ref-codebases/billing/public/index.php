<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Fail fast with a readable message if Herd/nginx is still using PHP < 8.3 (Composer requires ^8.3).
if (PHP_VERSION_ID < 80300) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'This application requires PHP 8.3 or newer. This worker is PHP '.PHP_VERSION.'. In Laravel Herd: set the site to PHP 8.3+ or run `herd isolate 8.4` in the project directory, then restart Herd.';
    exit(1);
}

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader...
require __DIR__.'/../vendor/autoload.php';

// Bootstrap Laravel and handle the request...
/** @var Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';

$app->handleRequest(Request::capture());
