<?php

declare(strict_types=1);

namespace App\Settings;

use Spatie\LaravelSettings\Settings;

final class PaymentNotificationSettings extends Settings
{
    public bool $notify_on_success;

    /** @var array<int, string> */
    public array $success_notification_emails;

    /**
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            'notify_on_success' => false,
            'success_notification_emails' => [],
        ];
    }

    public static function group(): string
    {
        return 'payment_notifications';
    }
}
