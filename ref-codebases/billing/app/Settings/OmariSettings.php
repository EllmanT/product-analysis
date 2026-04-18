<?php

declare(strict_types=1);

namespace App\Settings;

use Spatie\LaravelSettings\Settings;

final class OmariSettings extends Settings
{
    public string $merchant_api_key;

    public bool $production;

    public ?string $merchant_base_url;

    public int $timeout;

    public int $connect_timeout;

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
            'merchant_api_key' => '',
            'production' => false,
            'merchant_base_url' => null,
            'timeout' => 30,
            'connect_timeout' => 10,
        ];
    }

    public static function group(): string
    {
        return 'omari';
    }
}
