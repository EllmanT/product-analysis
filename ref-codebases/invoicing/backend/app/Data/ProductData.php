<?php

namespace App\Data;

use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
class ProductData extends Data
{
    public function __construct(
        public string $name,
        public ?string $description = null,
        public ?string $hsCode = null,
        public ?float $defaultUnitPrice = null,
        public string $taxCode = 'A',
        public float $taxPercent = 15.0,
        public ?string $unitOfMeasure = null,
        public bool $isActive = true,
    ) {}

    /** @return array<string, array<int, string>> */
    public static function validationRules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'hs_code' => ['nullable', 'string', 'max:20'],
            'default_unit_price' => ['required', 'numeric', 'min:0'],
            'tax_code' => ['required', 'string', 'exists:tax_rates,code'],
            'tax_percent' => ['numeric', 'min:0', 'max:100'],
            'unit_of_measure' => ['nullable', 'string', 'max:50'],
            'is_active' => ['boolean'],
        ];
    }

    /** @return array<string, array<int, string>> */
    public static function validationRulesForUpdate(): array
    {
        return array_map(fn (array $rules) => ['sometimes', ...array_diff($rules, ['required'])], self::validationRules());
    }
}
