<?php

declare(strict_types=1);

use Spatie\LaravelSettings\Models\SettingsProperty;
use Spatie\LaravelSettings\SettingsCasts\ArraySettingsCast;
use Spatie\LaravelSettings\SettingsRepositories\DatabaseSettingsRepository;

return [
    /*
     * Which repository should be used by default.
     */
    'default_repository' => 'default',

    /*
     * Auto discover settings classes in these directories.
     */
    'auto_discover_settings' => [
        app_path('Settings'),
    ],

    /*
     * The path where discovered settings are cached.
     */
    'discovered_settings_cache_path' => storage_path('app/settings-discovered.php'),

    /*
     * Settings repository configuration (database-backed).
     */
    'repositories' => [
        'default' => [
            'type' => DatabaseSettingsRepository::class,
            'model' => SettingsProperty::class,
            'table' => 'settings',
            'connection' => null,
        ],
    ],

    /*
     * Available casts for settings properties.
     */
    'casts' => [
        'array' => ArraySettingsCast::class,
    ],
];
