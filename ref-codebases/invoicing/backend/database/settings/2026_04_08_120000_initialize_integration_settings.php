<?php

declare(strict_types=1);

use Spatie\LaravelSettings\Migrations\SettingsMigration;

return new class extends SettingsMigration
{
    public function up(): void
    {
        $this->migrator->add('integration.zimra_api_url', (string) config('services.zimra.api_url'));
        $this->migrator->add('integration.fiscalcloud_api_url', (string) config('fiscalcloud.base_url'));
        $this->migrator->add('integration.fiscalcloud_api_timeout', (int) config('fiscalcloud.timeout'));
        $this->migrator->add('integration.fiscalcloud_api_key', (string) (config('fiscalcloud.api_key') ?? ''));
        $this->migrator->add('integration.axis_billing_base_url', (string) config('services.axis_billing.base_url'));
        $this->migrator->add('integration.axis_billing_api_key', (string) config('services.axis_billing.api_key'));
        $this->migrator->add('integration.axis_billing_webhook_secret', (string) (config('services.axis_billing.webhook_secret') ?? ''));
        $this->migrator->add('integration.axis_billing_team_id', (string) (config('services.axis_billing.team_id') ?? ''));
    }
};
