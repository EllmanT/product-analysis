<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Tenant-scoped cache TTL (seconds)
    |--------------------------------------------------------------------------
    |
    | Used for products and plans list/detail reads. Mutations invalidate keys.
    |
    */
    'cache_ttl_seconds' => (int) env('BILLING_CACHE_TTL', 3600),

    /*
    |--------------------------------------------------------------------------
    | API rate limiting (per minute)
    |--------------------------------------------------------------------------
    */
    'api_rate_limit' => (int) env('BILLING_API_RATE_LIMIT', 120),

    /*
    |--------------------------------------------------------------------------
    | Invoice document (HTML / PDF)
    |--------------------------------------------------------------------------
    |
    | Logo path is relative to public/ (default logo.png). If the file
    | is missing, the template falls back to text. Issuer details are shown under
    | the logo; use BILLING_INVOICE_ISSUER_DETAILS for one line per row (\n).
    |
    */
    'invoice' => [
        'logo_path' => env('BILLING_INVOICE_LOGO', 'logo.png'),
        'issuer_name' => env('BILLING_INVOICE_ISSUER_NAME', 'Axis solutions'),
        'issuer_details' => array_values(array_filter(explode("\n", str_replace("\r", '', (string) env(
            'BILLING_INVOICE_ISSUER_DETAILS',
            "14 Arundel Road, Alexandra Park, Harare, Zimbabwe\n+263 08677 004041\nsales@axissol.com\nwww.axissol.com"
        ))))),
        'payment_option_details' => [
            'cash' => 'Pay in cash at our office or to an authorised representative. Quote invoice #:invoice_id on your deposit slip or receipt.',
            'ecocash' => 'Pay with EcoCash where merchant billing or bill payments are available for your subscription.',
            'omari' => 'Pay through Omari (vSuite merchant flows) when enabled on your account.',
            'zimswitch' => 'Pay by card or bank via ZimSwitch / secure checkout when offered at payment time.',
        ],
    ],

];
