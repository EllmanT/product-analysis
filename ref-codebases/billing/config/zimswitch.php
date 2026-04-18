<?php

declare(strict_types=1);

return [
    /**
     * OPPWA / Hyperpay base URL (no trailing slash), e.g. https://eu-prod.oppwa.com
     */
    'base_url' => rtrim((string) env('ZIMSWITCH_BASE_URL', 'https://eu-prod.oppwa.com'), '/'),

    /** Bearer token for Authorization header (same as legacy PAYMENT_AUTHORIZATION_TOKEN). */
    'authorization_token' => env('ZIMSWITCH_AUTHORIZATION_TOKEN', env('PAYMENT_AUTHORIZATION_TOKEN')),

    /**
     * Payment options presented to users in hosted checkout.
     *
     * NOTE: These are intentionally NOT in `.env` so you can offer multiple entity ids
     * (similar to the legacy Angular `paymentTypes` list). `.env` should only contain
     * secrets and environment-specific values (token/base URL).
     *
     * `entity_id` maps to OPPWA `entityId`.
     * `data_brands` maps to the widget `data-brands` attribute.
     *
     * @var array<string, array{label: string, entity_id: string, data_brands: string}>
     */
    'payment_options' => [
        'visa_master_usd' => [
            'label' => 'Visa Mastercard (USD)',
            'entity_id' => '8acda4c79294a1be01929fdc25a14cc7',
            'data_brands' => 'VISA MASTER',
        ],
        'zimswitch_usd' => [
            'label' => 'Zimswitch (USD)',
            'entity_id' => '8acda4c79294a1be01929fdaf5944cb9',
            'data_brands' => 'PRIVATE_LABEL',
        ],
        'zimswitch_zig' => [
            'label' => 'Zimswitch (ZIG)',
            'entity_id' => '8acda4c79294a1be01929fdb77664cbf',
            'data_brands' => 'PRIVATE_LABEL',
        ],
    ],

    /**
     * Default payment type: DB = Direct Debit / card-style Copy & Pay (legacy app default for ZimSwitch).
     */
    'payment_type' => env('ZIMSWITCH_PAYMENT_TYPE', 'DB'),

    /**
     * Optional test header sent to OPPWA (e.g. INTERNAL). Leave null in production.
     */
    'test_mode_header' => env('ZIMSWITCH_TEST_MODE'),

    'timeout' => (int) env('ZIMSWITCH_TIMEOUT', 30),

    'connect_timeout' => (int) env('ZIMSWITCH_CONNECT_TIMEOUT', 10),

    /** When false, disables TLS verification (not recommended outside local dev). */
    'verify_ssl' => filter_var(env('ZIMSWITCH_VERIFY_SSL', true), FILTER_VALIDATE_BOOLEAN),

    /**
     * Optional JSON map of result codes → descriptions (Copy & Pay result code list).
     * If missing or empty, ZimswitchPaymentStatusMapper::getDescription falls back to a generic label.
     */
    'result_codes_path' => env('ZIMSWITCH_RESULT_CODES_PATH') ?: resource_path('data/zimswitch/copy_and_pay_result_codes.json'),

    /** Cache TTL for checkout ↔ invoice binding (seconds). */
    'checkout_cache_ttl' => (int) env('ZIMSWITCH_CHECKOUT_CACHE_TTL', 3600),
];
