<?php

declare(strict_types=1);

namespace App\Settings;

use Spatie\LaravelSettings\Settings;

final class IntegrationSettings extends Settings
{
    public string $zimra_api_url;

    public string $fiscalcloud_api_url;

    public int $fiscalcloud_api_timeout;

    public string $fiscalcloud_api_key = '';

    /** Docs AI (ZIMRA virtual fiscalisation helper); empty = fall back to .env `DOCS_AI_URL`. */
    public string $docs_ai_url = '';

    public string $axis_billing_base_url;

    public string $axis_billing_api_key;

    public string $axis_billing_webhook_secret;

    public string $axis_billing_team_id;

    /** Google OAuth (Socialite); empty = fall back to .env `GOOGLE_*`. */
    public string $google_oauth_client_id;

    public string $google_oauth_client_secret;

    /** Facebook OAuth (Socialite); empty = fall back to .env `FACEBOOK_*`. */
    public string $facebook_oauth_client_id;

    public string $facebook_oauth_client_secret;

    public static function group(): string
    {
        return 'integration';
    }
}
