<?php

declare(strict_types=1);

return [
    'api_url' => env('ECOCASH_API_URL'),
    'notify_url' => env('ECOCASH_NOTIFY_URL'),
    'username' => env('ECOCASH_USERNAME', 'AXIS'),
    'password' => env('ECOCASH_PASSWORD'),
    'merchant_code' => env('ECOCASH_MERCHANT_CODE'),
    'merchant_pin' => env('ECOCASH_MERCHANT_PIN'),
    'terminal_id' => env('ECOCASH_TERMINAL_ID', 'TERM123456'),
    'location' => env('ECOCASH_LOCATION', 'Harare'),
    'super_merchant' => env('ECOCASH_SUPER_MERCHANT', 'CABS'),
    'merchant_name' => env('ECOCASH_MERCHANT_NAME', 'Axis Online'),
    /** Default local currency sent to EcoCash when no override is provided. */
    'currency' => env('ECOCASH_CURRENCY', 'ZWG'),
];
