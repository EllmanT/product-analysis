<?php

declare(strict_types=1);

namespace App\Settings;

use App\Settings\Casts\AssocArrayCast;
use Spatie\LaravelSettings\Settings;

/**
 * @phpstan-type PaymentOption array{label: string, entity_id: string, data_brands: string}
 */
final class ZimswitchSettings extends Settings
{
    public string $base_url;

    public string $authorization_token;

    public string $payment_type;

    public ?string $test_mode_header;

    public bool $verify_ssl;

    public int $timeout;

    public int $connect_timeout;

    /** @var array<string, PaymentOption> */
    public array $payment_options;

    /**
     * @return array<string, string>
     */
    public static function casts(): array
    {
        return [
            'payment_options' => AssocArrayCast::class,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            'base_url' => 'https://eu-prod.oppwa.com',
            'authorization_token' => '',
            'payment_type' => 'DB',
            'test_mode_header' => null,
            'verify_ssl' => true,
            'timeout' => 30,
            'connect_timeout' => 10,
            'payment_options' => config('zimswitch.payment_options', []),
        ];
    }

    public static function group(): string
    {
        return 'zimswitch';
    }
}
