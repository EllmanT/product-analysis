<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'zimra' => [
        'api_url' => env('ZIMRA_API_URL', 'https://fdmsapitest.zimra.co.zw'),
        'api_key' => env('ZIMRA_API_KEY'),
        'tenant_id' => env('ZIMRA_TENANT_ID'),
        'fdms_template_path' => env('ZIMRA_FDMS_TEMPLATE_PATH', base_path('storage/app/templates/fdms-prod-application-form.xlsx')),
        'fdms_email_to' => env('ZIMRA_FDMS_EMAIL_TO', 'developers@axissol.com'),
    ],

    'axis_billing' => [
        'base_url' => env('AXIS_BILLING_BASE_URL'),
        'api_key' => env('AXIS_BILLING_API_KEY'),
        'webhook_secret' => env('AXIS_BILLING_WEBHOOK_SECRET'),
        'team_id' => env('AXIS_BILLING_TEAM_ID'),
    ],

    'docs_ai' => [
        'base_url' => env('DOCS_AI_URL'),
        'connect_timeout' => (int) env('DOCS_AI_CONNECT_TIMEOUT', 10),
        'timeout' => (int) env('DOCS_AI_TIMEOUT', 30),
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI'),
    ],

    'facebook' => [
        'client_id' => env('FACEBOOK_CLIENT_ID'),
        'client_secret' => env('FACEBOOK_CLIENT_SECRET'),
        'redirect' => env('FACEBOOK_REDIRECT_URI'),
    ],

];
