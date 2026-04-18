<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Fiscal Cloud API
    |--------------------------------------------------------------------------
    |
    | Base URL should include the API prefix, e.g. https://api.fiscalcloud.co.zw/api
    |
    */

    'base_url' => rtrim(env('FISCALCLOUD_API_URL', 'https://api.fiscalcloud.co.zw/api'), '/'),

    // Optional Fiscal Cloud E-Invoicing API key (sent as `X-API-Key` when present).
    'api_key' => env('FISCALCLOUD_API_KEY'),

    'timeout' => (int) env('FISCALCLOUD_API_TIMEOUT', 30),

];
