<?php

namespace App\Data;

use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
class CompanyData extends Data
{
    public function __construct(
        public string $legalName,
        public ?string $tradeName = null,
        public string $tin,
        public ?string $vatNumber = null,
        public ?string $address = null,
        public ?string $phone = null,
        public ?string $email = null,
        public ?string $logoUrl = null,
        public bool $isServiceCompany = false,
        public bool $defaultTaxInclusive = true,
        public string $defaultCurrency = 'ZWG',
        public bool $isActive = true,
    ) {}

    /** @return array<string, array<int, string>> */
    public static function validationRules(): array
    {
        return [
            'legal_name' => ['required', 'string', 'max:255'],
            'trade_name' => ['nullable', 'string', 'max:255'],
            'tin' => ['required', 'string', 'max:50'],
            'vat_number' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'logo_url' => ['nullable', 'string', 'max:500'],
            'is_service_company' => ['boolean'],
            'default_tax_inclusive' => ['boolean'],
            'default_currency' => ['string', 'max:10'],
            'is_active' => ['boolean'],
        ];
    }

    /** @return array<string, array<int, string>> */
    public static function validationRulesForUpdate(): array
    {
        return array_map(fn (array $rules) => ['sometimes', ...array_diff($rules, ['required'])], self::validationRules());
    }
}
