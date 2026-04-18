<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Settings\IntegrationSettings;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;
use Throwable;

class OAuthController extends Controller
{
    /**
     * Start OAuth sign-in/up and redirect to the provider.
     */
    public function redirect(Request $request, string $provider): RedirectResponse
    {
        $provider = $this->normalizeProvider($provider);
        $this->applySocialiteConfigFromSettings();

        $redirectUri = (string) $request->query('redirect_uri', '');
        $redirectUri = trim($redirectUri);

        $frontendUrl = rtrim((string) config('app.frontend_url'), '/');
        $defaultRedirect = $frontendUrl.'/auth/callback';
        if ($redirectUri === '' || ! $this->isAllowedOAuthRedirectUri($redirectUri)) {
            $redirectUri = $defaultRedirect;
        }

        $state = Crypt::encryptString(json_encode([
            'redirect_uri' => $redirectUri,
            'ts' => time(),
        ], JSON_THROW_ON_ERROR));

        return Socialite::driver($provider)
            ->stateless()
            ->with(['state' => $state])
            ->redirect();
    }

    /**
     * Provider callback: create/link user, issue Sanctum token, redirect to SPA.
     */
    public function callback(Request $request, string $provider): RedirectResponse
    {
        $provider = $this->normalizeProvider($provider);
        $this->applySocialiteConfigFromSettings();

        $frontendUrl = rtrim((string) config('app.frontend_url'), '/');
        $redirectUri = $frontendUrl.'/auth/callback';

        $state = $request->query('state');
        if (is_string($state) && $state !== '') {
            try {
                $decoded = json_decode(Crypt::decryptString($state), true, flags: JSON_THROW_ON_ERROR);
                if (is_array($decoded) && isset($decoded['redirect_uri']) && is_string($decoded['redirect_uri'])) {
                    $candidate = trim($decoded['redirect_uri']);
                    if ($candidate !== '' && $this->isAllowedOAuthRedirectUri($candidate)) {
                        $redirectUri = $candidate;
                    }
                }
            } catch (Throwable) {
                // ignore invalid state, keep default redirect
            }
        }

        try {
            $socialUser = Socialite::driver($provider)->stateless()->user();
        } catch (Throwable $e) {
            return redirect()->away($redirectUri.'?message='.urlencode('OAuth login failed. Please try again.'));
        }

        $providerId = (string) ($socialUser->getId() ?? '');
        $email = (string) ($socialUser->getEmail() ?? '');
        $email = mb_strtolower(trim($email));

        if ($email === '') {
            return redirect()->away($redirectUri.'?message='.urlencode('No email was provided by the provider.'));
        }

        /** @var User|null $user */
        $user = User::query()
            ->where('oauth_provider', $provider)
            ->where('oauth_provider_id', $providerId)
            ->first();

        if ($user === null) {
            $user = User::query()->whereRaw('LOWER(email) = ?', [$email])->first();
        }

        if ($user === null) {
            $name = (string) ($socialUser->getName() ?? '');
            $name = trim($name);
            $parts = preg_split('/\s+/', $name) ?: [];
            $first = $parts[0] ?? 'User';
            $last = count($parts) > 1 ? implode(' ', array_slice($parts, 1)) : 'Account';

            $user = User::query()->create([
                'company_id' => null,
                'first_name' => $first,
                'last_name' => $last,
                'email' => $email,
                'phone' => null,
                // Keep password non-null for now (schema requires it)
                'password' => Str::random(48),
                'role' => 'ADMIN',
                'is_active' => true,
                'oauth_provider' => $provider,
                'oauth_provider_id' => $providerId ?: null,
            ]);
        } else {
            if (! $user->oauth_provider || ! $user->oauth_provider_id) {
                $user->oauth_provider = $provider;
                $user->oauth_provider_id = $providerId ?: null;
                $user->save();
            }
        }

        if (! $user->is_active) {
            return redirect()->away($redirectUri.'?message='.urlencode('Account is inactive.'));
        }

        $token = $user->createToken('oauth')->plainTextToken;

        return redirect()->away($redirectUri.'?token='.urlencode($token));
    }

    /**
     * Allow SPA (FRONTEND_URL) or native app deep links (configured prefixes).
     */
    private function isAllowedOAuthRedirectUri(string $uri): bool
    {
        $uri = trim($uri);
        if ($uri === '' || strlen($uri) > 2048) {
            return false;
        }

        $lower = mb_strtolower($uri);
        foreach (['javascript:', 'data:', 'vbscript:'] as $blocked) {
            if (str_starts_with($lower, $blocked)) {
                return false;
            }
        }

        $frontendUrl = rtrim((string) config('app.frontend_url'), '/');
        if (str_starts_with($uri, $frontendUrl)) {
            return true;
        }

        /** @var array<int, string> $prefixes */
        $prefixes = config('app.mobile_oauth_redirect_prefixes', []);
        foreach ($prefixes as $prefix) {
            $prefix = trim($prefix);
            if ($prefix !== '' && str_starts_with($uri, $prefix)) {
                return true;
            }
        }

        return false;
    }

    private function normalizeProvider(string $provider): string
    {
        $provider = mb_strtolower(trim($provider));
        if (! in_array($provider, ['google', 'facebook'], true)) {
            abort(404);
        }

        return $provider;
    }

    /**
     * Merge OAuth client credentials from DB (Integration settings) over config/services.php / .env.
     */
    private function applySocialiteConfigFromSettings(): void
    {
        /** @var IntegrationSettings $s */
        $s = app(IntegrationSettings::class);

        $googleId = trim($s->google_oauth_client_id ?? '');
        $googleSecret = trim($s->google_oauth_client_secret ?? '');
        if ($googleId !== '' && $googleSecret !== '') {
            config([
                'services.google.client_id' => $googleId,
                'services.google.client_secret' => $googleSecret,
            ]);
        }

        $facebookId = trim($s->facebook_oauth_client_id ?? '');
        $facebookSecret = trim($s->facebook_oauth_client_secret ?? '');
        if ($facebookId !== '' && $facebookSecret !== '') {
            config([
                'services.facebook.client_id' => $facebookId,
                'services.facebook.client_secret' => $facebookSecret,
            ]);
        }

        $base = rtrim((string) config('app.url'), '/');
        if (trim((string) config('services.google.redirect')) === '') {
            config(['services.google.redirect' => $base.'/api/public/oauth/google/callback']);
        }
        if (trim((string) config('services.facebook.redirect')) === '') {
            config(['services.facebook.redirect' => $base.'/api/public/oauth/facebook/callback']);
        }
    }
}

