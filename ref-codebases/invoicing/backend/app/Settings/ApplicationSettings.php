<?php

declare(strict_types=1);

namespace App\Settings;

use Spatie\LaravelSettings\Settings;

final class ApplicationSettings extends Settings
{
    public string $app_name;

    public string $app_url;

    public bool $app_debug;

    public string $timezone;

    public static function group(): string
    {
        return 'application';
    }
}
