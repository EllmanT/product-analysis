<?php

declare(strict_types=1);

namespace App\Filesystem;

use Illuminate\Filesystem\Filesystem as BaseFilesystem;
use RuntimeException;

/**
 * Windows + Wayfinder: {@see BaseFilesystem::ensureDirectoryExists} calls plain {@see mkdir},
 * which can raise "File exists" when the directory is already there (race or path normalization).
 * Laravel's own {@see BaseFilesystem::makeDirectory} supports $force to use {@see @mkdir}.
 */
final class Filesystem extends BaseFilesystem
{
    public function ensureDirectoryExists($path, $mode = 0755, $recursive = true): void
    {
        if ($this->isDirectory($path)) {
            return;
        }

        if ($this->exists($path) && ! $this->isDirectory($path)) {
            throw new RuntimeException(
                "Cannot create directory [{$path}]: a file exists at this path. Remove or rename the file, then run `php artisan wayfinder:generate` again."
            );
        }

        $this->makeDirectory($path, $mode, $recursive, true);

        if (! $this->isDirectory($path)) {
            throw new RuntimeException("Failed to create directory [{$path}].");
        }
    }
}
