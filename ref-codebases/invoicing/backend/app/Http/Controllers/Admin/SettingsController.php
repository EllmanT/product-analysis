<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Settings\ApplicationSettings;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class SettingsController extends Controller
{
    public function edit(): Response
    {
        $settings = app(ApplicationSettings::class);

        return Inertia::render('Admin/Settings/Application', [
            'settings' => [
                'app_name' => $settings->app_name,
                'app_url' => $settings->app_url,
                'app_debug' => $settings->app_debug,
                'timezone' => $settings->timezone,
            ],
            'envNote' => 'APP_KEY and bootstrap-only values stay in .env. These settings are stored in the database and applied at runtime.',
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'app_name' => ['required', 'string', 'max:255'],
            'app_url' => ['required', 'string', 'url', 'max:2048'],
            'app_debug' => ['required', 'boolean'],
            'timezone' => ['required', 'string', 'max:64'],
        ]);

        /** @var ApplicationSettings $settings */
        $settings = app(ApplicationSettings::class);
        $settings->app_name = $validated['app_name'];
        $settings->app_url = $validated['app_url'];
        $settings->app_debug = $validated['app_debug'];
        $settings->timezone = $validated['timezone'];
        $settings->save();

        return redirect()->route('admin.settings.application')->with('success', 'Settings saved.');
    }
}
