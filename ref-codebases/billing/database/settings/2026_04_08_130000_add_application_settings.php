<?php

use Spatie\LaravelSettings\Migrations\SettingsMigration;

return new class extends SettingsMigration
{
    public function up(): void
    {
        $this->migrator->add('application.name', env('APP_NAME', 'Laravel'));
        $this->migrator->add('application.url', env('APP_URL', 'http://localhost'));
        $this->migrator->add('application.debug', filter_var(env('APP_DEBUG', false), FILTER_VALIDATE_BOOLEAN));
        $this->migrator->add('application.timezone', 'Africa/Harare');
    }
};
