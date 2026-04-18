<?php

declare(strict_types=1);

namespace App\Settings;

use Spatie\LaravelSettings\Settings;

final class MailSettings extends Settings
{
    public string $default_mailer;

    public ?string $smtp_scheme;

    public string $smtp_host;

    public int $smtp_port;

    public ?string $smtp_username;

    public string $smtp_password;

    public string $from_address;

    public string $from_name;

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
            'default_mailer' => env('MAIL_MAILER', 'log'),
            'smtp_scheme' => env('MAIL_SCHEME'),
            'smtp_host' => env('MAIL_HOST', '127.0.0.1'),
            'smtp_port' => (int) env('MAIL_PORT', 2525),
            'smtp_username' => env('MAIL_USERNAME'),
            'smtp_password' => (string) env('MAIL_PASSWORD', ''),
            'from_address' => env('MAIL_FROM_ADDRESS', 'hello@example.com'),
            'from_name' => env('MAIL_FROM_NAME', env('APP_NAME', 'Laravel')),
        ];
    }

    public static function group(): string
    {
        return 'mail';
    }
}
