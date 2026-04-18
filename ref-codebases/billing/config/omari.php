<?php

declare(strict_types=1);

return [
    /**
     * Merchant API key (sent as X-Merchant-Key), from Omari / vSuite.
     * Mirrors omari_integration OmariPayments.init(apiKey: ...).
     */
    'merchant_api_key' => env('OMARI_MERCHANT_API_KEY'),

    /**
     * When true, use production Omari URLs; when false, UAT (same as Flutter prodEnv).
     */
    'production' => filter_var(env('OMARI_PRODUCTION', false), FILTER_VALIDATE_BOOLEAN),

    /**
     * Optional full base URL override for the merchant payment API (no trailing slash).
     * If set, ignores production/UAT defaults below.
     */
    'merchant_base_url' => env('OMARI_MERCHANT_BASE_URL'),

    'timeout' => (int) env('OMARI_TIMEOUT', 30),

    'connect_timeout' => (int) env('OMARI_CONNECT_TIMEOUT', 10),
];
