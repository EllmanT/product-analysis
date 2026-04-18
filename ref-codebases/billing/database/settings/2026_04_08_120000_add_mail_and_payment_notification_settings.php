<?php

use Spatie\LaravelSettings\Migrations\SettingsMigration;

return new class extends SettingsMigration
{
    public function up(): void
    {
        $this->migrator->add('mail.default_mailer', env('MAIL_MAILER', 'log'));
        $this->migrator->add('mail.smtp_scheme', env('MAIL_SCHEME'));
        $this->migrator->add('mail.smtp_host', env('MAIL_HOST', '127.0.0.1'));
        $this->migrator->add('mail.smtp_port', (int) env('MAIL_PORT', 2525));
        $this->migrator->add('mail.smtp_username', env('MAIL_USERNAME'));
        $this->migrator->add('mail.smtp_password', (string) env('MAIL_PASSWORD', ''));
        $this->migrator->add('mail.from_address', env('MAIL_FROM_ADDRESS', 'hello@example.com'));
        $this->migrator->add('mail.from_name', env('MAIL_FROM_NAME', env('APP_NAME', 'Laravel')));

        $this->migrator->add('payment_notifications.notify_on_success', false);
        $this->migrator->add('payment_notifications.success_notification_emails', []);
    }
};
