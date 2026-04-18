<?php

declare(strict_types=1);

use Spatie\LaravelSettings\Migrations\SettingsMigration;

return new class extends SettingsMigration
{
    public function up(): void
    {
        $this->migrator->add('application.app_name', (string) config('app.name'));
        $this->migrator->add('application.app_url', (string) config('app.url'));
        $this->migrator->add('application.app_debug', (bool) config('app.debug'));
        $this->migrator->add('application.timezone', (string) config('app.timezone'));
    }
};
