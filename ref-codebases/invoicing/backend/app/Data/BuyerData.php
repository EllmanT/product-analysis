<?php

namespace App\Data;

use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
class BuyerData extends Data
{
    public function __construct(
        public string $registerName,
        public ?string $tradeName = null,
        public ?string $tin = null,
        public ?string $vatNumber = null,
        public ?string $addressProvince = null,
        public ?string $addressCity = null,
        public ?string $addressStreet = null,
        public ?string $addressHouseNo = null,
        public ?string $email = null,
        public ?string $phone = null,
        public bool $isActive = true,
    ) {}

    /** @return array<string, array<int, string>> */
    public static function validationRules(): array
    {
        return [
            'register_name' => ['required', 'string', 'max:255'],
            'trade_name' => ['nullable', 'string', 'max:255'],
            'tin' => ['nullable', 'string', 'max:50'],
            'vat_number' => ['nullable', 'string', 'max:50'],
            'address_province' => ['nullable', 'string', 'max:100'],
            'address_city' => ['nullable', 'string', 'max:100'],
            'address_street' => ['nullable', 'string', 'max:255'],
            'address_house_no' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'is_active' => ['boolean'],
        ];
    }

    /** @return array<string, array<int, string>> */
    public static function validationRulesForUpdate(): array
    {
        return array_map(fn (array $rules) => ['sometimes', ...array_diff($rules, ['required'])], self::validationRules());
    }
}
