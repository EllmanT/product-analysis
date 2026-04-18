<?php

declare(strict_types=1);

use Spatie\LaravelSettings\Migrations\SettingsMigration;

return new class extends SettingsMigration
{
    public function up(): void
    {
        // Lookup flow removed; token no longer used.
        $this->migrator->delete('integration.fiscalcloud_api_token');
    }
};

