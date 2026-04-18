<?php

declare(strict_types=1);

namespace App\Settings\Casts;

use Spatie\LaravelSettings\SettingsCasts\SettingsCast;

/**
 * Pass-through cast for associative arrays stored as JSON payload.
 */
final class AssocArrayCast implements SettingsCast
{
    /**
     * @param  mixed  $payload
     * @return array<string, mixed>
     */
    public function get($payload): array
    {
        return is_array($payload) ? $payload : [];
    }

    /**
     * @param  mixed  $payload
     * @return array<string, mixed>
     */
    public function set($payload): array
    {
        return is_array($payload) ? $payload : [];
    }
}
