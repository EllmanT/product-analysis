<?php

declare(strict_types=1);

use Spatie\LaravelSettings\Migrations\SettingsMigration;

return new class extends SettingsMigration
{
    public function up(): void
    {
        $this->migrator->add('integration.docs_ai_url', (string) (config('services.docs_ai.base_url') ?? ''));
    }
};

