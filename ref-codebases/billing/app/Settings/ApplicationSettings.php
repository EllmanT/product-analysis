<?php

declare(strict_types=1);

namespace App\Settings;

use Spatie\LaravelSettings\Settings;

final class ApplicationSettings extends Settings
{
    public string $name;

    public string $url;

    public bool $debug;

    public string $timezone;

    /**
     * @return array<string, string>
     */
    public static function casts(): array
    {
        return [];
    }

    /**
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            'name' => env('APP_NAME', 'Laravel'),
            'url' => env('APP_URL', 'http://localhost'),
            'debug' => filter_var(env('APP_DEBUG', false), FILTER_VALIDATE_BOOLEAN),
            'timezone' => 'Africa/Harare',
        ];
    }

    public static function group(): string
    {
        return 'application';
    }
}
