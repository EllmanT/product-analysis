<?php

declare(strict_types=1);

namespace App\Settings;

use Spatie\LaravelSettings\Settings;

final class EcoCashSettings extends Settings
{
    public string $api_url;

    public string $notify_url;

    public string $username;

    public string $password;

    public string $merchant_code;

    public string $merchant_pin;

    public string $terminal_id;

    public string $location;

    public string $super_merchant;

    public string $merchant_name;

    public string $currency;

    /**
     * @return array<string, string>
     */
    public static function casts(): array
    {
        return [];
    }

    /**
     * Prevents MissingSettings exceptions on fresh installs.
     *
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            'api_url' => '',
            'notify_url' => '',
            'username' => 'AXIS',
            'password' => '',
            'merchant_code' => '',
            'merchant_pin' => '',
            'terminal_id' => 'TERM123456',
            'location' => 'Harare',
            'super_merchant' => 'CABS',
            'merchant_name' => 'Axis Online',
            'currency' => 'ZWG',
        ];
    }

    public static function group(): string
    {
        return 'ecocash';
    }
}
