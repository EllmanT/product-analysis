<?php

declare(strict_types=1);

namespace App\Enums;

enum PaymentPlatform: string
{
    case EcoCash = 'ecocash';
    case Omari = 'omari';
    case ZimSwitch = 'zimswitch';

    public function label(): string
    {
        return match ($this) {
            self::EcoCash => 'EcoCash',
            self::Omari => 'Omari',
            self::ZimSwitch => 'ZimSwitch',
        };
    }

    /** Public path to the platform logo, e.g. /payment-platform-logos/ecocash.png */
    public function logo(): string
    {
        return "/payment-platform-logos/{$this->value}.png";
    }

    /** @return list<self> */
    public static function all(): array
    {
        return self::cases();
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
