<?php

namespace App\Data;

use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
class BankingDetailData extends Data
{
    public function __construct(
        public string $label,
        public string $accountName,
        public string $accountNumber,
        public ?string $branch = null,
        public ?string $bankName = null,
        public string $currency,
        public ?string $swiftCode = null,
        public int $sortOrder = 0,
        public bool $isDefault = false,
        public bool $isActive = true,
    ) {}

    /** @return array<string, array<int, string>> */
    public static function validationRules(): array
    {
        return [
            'label' => ['nullable', 'string', 'max:100'],
            'account_name' => ['required', 'string', 'max:255'],
            'account_number' => ['required', 'string', 'max:100'],
            'branch' => ['nullable', 'string', 'max:100'],
            'bank_name' => ['nullable', 'string', 'max:255'],
            'currency' => ['required', 'string', 'max:10'],
            'swift_code' => ['nullable', 'string', 'max:20'],
            'sort_order' => ['integer'],
            'is_default' => ['boolean'],
            'is_active' => ['boolean'],
        ];
    }

    /** @return array<string, array<int, string>> */
    public static function validationRulesForUpdate(): array
    {
        return array_map(fn (array $rules) => ['sometimes', ...array_diff($rules, ['required'])], self::validationRules());
    }
}
