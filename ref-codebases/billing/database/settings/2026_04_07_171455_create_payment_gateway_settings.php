<?php

use Spatie\LaravelSettings\Migrations\SettingsMigration;

return new class extends SettingsMigration
{
    public function up(): void
    {
        // EcoCash
        $this->migrator->add('ecocash.api_url', env('ECOCASH_API_URL', ''));
        $this->migrator->add('ecocash.notify_url', env('ECOCASH_NOTIFY_URL', ''));
        $this->migrator->add('ecocash.username', env('ECOCASH_USERNAME', 'AXIS'));
        $this->migrator->add('ecocash.password', env('ECOCASH_PASSWORD', ''));
        $this->migrator->add('ecocash.merchant_code', env('ECOCASH_MERCHANT_CODE', ''));
        $this->migrator->add('ecocash.merchant_pin', env('ECOCASH_MERCHANT_PIN', ''));
        $this->migrator->add('ecocash.terminal_id', env('ECOCASH_TERMINAL_ID', 'TERM123456'));
        $this->migrator->add('ecocash.location', env('ECOCASH_LOCATION', 'Harare'));
        $this->migrator->add('ecocash.super_merchant', env('ECOCASH_SUPER_MERCHANT', 'CABS'));
        $this->migrator->add('ecocash.merchant_name', env('ECOCASH_MERCHANT_NAME', 'Axis Online'));
        $this->migrator->add('ecocash.currency', env('ECOCASH_CURRENCY', 'ZWG'));

        // ZimSwitch / OPPWA
        $this->migrator->add('zimswitch.base_url', env('ZIMSWITCH_BASE_URL', 'https://eu-prod.oppwa.com'));
        $this->migrator->add('zimswitch.authorization_token', env('ZIMSWITCH_AUTHORIZATION_TOKEN', env('PAYMENT_AUTHORIZATION_TOKEN', '')));
        $this->migrator->add('zimswitch.payment_type', env('ZIMSWITCH_PAYMENT_TYPE', 'DB'));
        $this->migrator->add('zimswitch.test_mode_header', env('ZIMSWITCH_TEST_MODE'));
        $this->migrator->add('zimswitch.verify_ssl', filter_var(env('ZIMSWITCH_VERIFY_SSL', true), FILTER_VALIDATE_BOOLEAN));
        $this->migrator->add('zimswitch.timeout', (int) env('ZIMSWITCH_TIMEOUT', 30));
        $this->migrator->add('zimswitch.connect_timeout', (int) env('ZIMSWITCH_CONNECT_TIMEOUT', 10));
        $this->migrator->add('zimswitch.payment_options', [
            'visa_master_usd' => [
                'label' => 'Visa Mastercard (USD)',
                'entity_id' => '8acda4c79294a1be01929fdc25a14cc7',
                'data_brands' => 'VISA MASTER',
            ],
            'ecocash_usd' => [
                'label' => 'Ecocash (USD)',
                'entity_id' => '8acda4c79294a1be01929fdc25a14cc7',
                'data_brands' => 'PRIVATE_LABEL',
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
        ]);

        // Omari
        $this->migrator->add('omari.merchant_api_key', env('OMARI_MERCHANT_API_KEY', ''));
        $this->migrator->add('omari.production', filter_var(env('OMARI_PRODUCTION', false), FILTER_VALIDATE_BOOLEAN));
        $this->migrator->add('omari.merchant_base_url', env('OMARI_MERCHANT_BASE_URL'));
        $this->migrator->add('omari.timeout', (int) env('OMARI_TIMEOUT', 30));
        $this->migrator->add('omari.connect_timeout', (int) env('OMARI_CONNECT_TIMEOUT', 10));
    }
};
