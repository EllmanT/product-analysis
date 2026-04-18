<?php

declare(strict_types=1);

use Spatie\LaravelSettings\Migrations\SettingsMigration;

return new class extends SettingsMigration
{
    public function up(): void
    {
        $this->migrator->add('integration.google_oauth_client_id', (string) (config('services.google.client_id') ?? ''));
        $this->migrator->add('integration.google_oauth_client_secret', (string) (config('services.google.client_secret') ?? ''));
        $this->migrator->add('integration.facebook_oauth_client_id', (string) (config('services.facebook.client_id') ?? ''));
        $this->migrator->add('integration.facebook_oauth_client_secret', (string) (config('services.facebook.client_secret') ?? ''));
    }
};
