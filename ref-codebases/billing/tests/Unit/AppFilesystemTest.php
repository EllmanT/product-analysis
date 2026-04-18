<?php

declare(strict_types=1);

use App\Filesystem\Filesystem;

test('ensureDirectoryExists is a no-op when directory already exists', function () {
    $dir = sys_get_temp_dir().'/axis-fs-'.uniqid('', true);
    mkdir($dir, 0755, true);

    $fs = new Filesystem;
    $fs->ensureDirectoryExists($dir);

    expect(is_dir($dir))->toBeTrue();

    rmdir($dir);
});

test('ensureDirectoryExists throws when a file occupies the path', function () {
    $path = sys_get_temp_dir().'/axis-fs-file-'.uniqid('', true);
    file_put_contents($path, 'x');

    $fs = new Filesystem;

    try {
        expect(fn () => $fs->ensureDirectoryExists($path))->toThrow(RuntimeException::class);
    } finally {
        unlink($path);
    }
});

test('ensureDirectoryExists creates missing directories', function () {
    $dir = sys_get_temp_dir().'/axis-fs-new-'.uniqid('', true);

    $fs = new Filesystem;
    $fs->ensureDirectoryExists($dir);

    expect(is_dir($dir))->toBeTrue();

    rmdir($dir);
});
