<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Settings\IntegrationSettings;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

final class IntegrationSettingsController extends Controller
{
    public function edit(): Response
    {
        $s = app(IntegrationSettings::class);

        return Inertia::render('Admin/Settings/Integration', [
            'settings' => [
                'zimra_api_url' => $s->zimra_api_url,
                'fiscalcloud_api_url' => $s->fiscalcloud_api_url,
                'fiscalcloud_api_timeout' => $s->fiscalcloud_api_timeout,
                'fiscalcloud_api_key' => $s->fiscalcloud_api_key,
                'docs_ai_url' => $s->docs_ai_url,
                'axis_billing_base_url' => $s->axis_billing_base_url,
                'axis_billing_api_key' => $s->axis_billing_api_key,
                'axis_billing_webhook_secret' => $s->axis_billing_webhook_secret,
                'axis_billing_team_id' => $s->axis_billing_team_id,
                'google_oauth_client_id' => $s->google_oauth_client_id,
                'google_oauth_client_secret' => $s->google_oauth_client_secret,
                'facebook_oauth_client_id' => $s->facebook_oauth_client_id,
                'facebook_oauth_client_secret' => $s->facebook_oauth_client_secret,
            ],
            'oauthCallbackUrls' => [
                'google' => url('/api/public/oauth/google/callback'),
                'facebook' => url('/api/public/oauth/facebook/callback'),
            ],
            'envNote' => 'Values are stored in the database and override .env for this app at runtime. Restart queue workers after changing webhooks or keys.',
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $section = (string) $request->input('section', '');

        /** @var IntegrationSettings $settings */
        $settings = app(IntegrationSettings::class);

        $message = match ($section) {
            'zimra' => $this->saveZimra($request, $settings),
            'fiscalcloud' => $this->saveFiscalCloud($request, $settings),
            'docs_ai' => $this->saveDocsAi($request, $settings),
            'axis_billing' => $this->saveAxisBilling($request, $settings),
            'google_oauth' => $this->saveGoogleOauth($request, $settings),
            'facebook_oauth' => $this->saveFacebookOauth($request, $settings),
            default => throw ValidationException::withMessages([
                'section' => ['Choose a valid section.'],
            ]),
        };

        return redirect()->route('admin.settings.integration')->with('success', $message);
    }

    private function saveZimra(Request $request, IntegrationSettings $settings): string
    {
        $validated = $request->validate([
            'zimra_api_url' => ['required', 'string', 'max:2048'],
        ]);

        $settings->zimra_api_url = $validated['zimra_api_url'];
        $settings->save();

        return 'ZIMRA (FDMS) settings saved.';
    }

    private function saveFiscalCloud(Request $request, IntegrationSettings $settings): string
    {
        $validated = $request->validate([
            'fiscalcloud_api_url' => ['required', 'string', 'max:2048'],
            'fiscalcloud_api_timeout' => ['required', 'integer', 'min:1', 'max:600'],
            'fiscalcloud_api_key' => ['nullable', 'string', 'max:4096'],
        ]);

        $settings->fiscalcloud_api_url = rtrim($validated['fiscalcloud_api_url'], '/');
        $settings->fiscalcloud_api_timeout = $validated['fiscalcloud_api_timeout'];
        $settings->fiscalcloud_api_key = (string) ($validated['fiscalcloud_api_key'] ?? '');
        $settings->save();

        return 'Fiscal Cloud settings saved.';
    }

    private function saveDocsAi(Request $request, IntegrationSettings $settings): string
    {
        $validated = $request->validate([
            'docs_ai_url' => ['required', 'string', 'max:2048'],
        ]);

        $settings->docs_ai_url = rtrim($validated['docs_ai_url'], '/');
        $settings->save();

        return 'Docs AI settings saved.';
    }

    private function saveAxisBilling(Request $request, IntegrationSettings $settings): string
    {
        $validated = $request->validate([
            'axis_billing_base_url' => ['required', 'string', 'max:2048'],
            'axis_billing_api_key' => ['required', 'string', 'max:2048'],
            'axis_billing_webhook_secret' => ['nullable', 'string', 'max:2048'],
            'axis_billing_team_id' => ['nullable', 'string', 'max:64'],
        ]);

        $settings->axis_billing_base_url = $validated['axis_billing_base_url'];
        $settings->axis_billing_api_key = $validated['axis_billing_api_key'];
        $settings->axis_billing_webhook_secret = (string) ($validated['axis_billing_webhook_secret'] ?? '');
        $settings->axis_billing_team_id = (string) ($validated['axis_billing_team_id'] ?? '');
        $settings->save();

        return 'Axis Billing settings saved.';
    }

    private function saveGoogleOauth(Request $request, IntegrationSettings $settings): string
    {
        $validated = $request->validate([
            'google_oauth_client_id' => ['required', 'string', 'max:2048'],
            'google_oauth_client_secret' => ['required', 'string', 'max:2048'],
        ]);

        $settings->google_oauth_client_id = trim($validated['google_oauth_client_id']);
        $settings->google_oauth_client_secret = trim($validated['google_oauth_client_secret']);
        $settings->save();

        return 'Google OAuth settings saved.';
    }

    private function saveFacebookOauth(Request $request, IntegrationSettings $settings): string
    {
        $validated = $request->validate([
            'facebook_oauth_client_id' => ['required', 'string', 'max:2048'],
            'facebook_oauth_client_secret' => ['required', 'string', 'max:2048'],
        ]);

        $settings->facebook_oauth_client_id = trim($validated['facebook_oauth_client_id']);
        $settings->facebook_oauth_client_secret = trim($validated['facebook_oauth_client_secret']);
        $settings->save();

        return 'Facebook OAuth settings saved.';
    }
}
