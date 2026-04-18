<?php

namespace App\Data;

use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
class HSCodeData extends Data
{
    public function __construct(
        public string $code,
        public string $description,
        public ?string $category = null,
        public bool $isService = false,
        public ?string $defaultTaxCode = null,
        public bool $isActive = true,
    ) {}

    /** @return array<string, array<int, string>> */
    public static function validationRules(): array
    {
        return [
            'code' => ['required', 'string', 'max:20'],
            'description' => ['required', 'string'],
            'category' => ['nullable', 'string', 'max:255'],
            'is_service' => ['boolean'],
            'default_tax_code' => ['nullable', 'string', 'in:A,B,C'],
            'is_active' => ['boolean'],
        ];
    }

    /** @return array<string, array<int, string>> */
    public static function validationRulesForUpdate(): array
    {
        return array_map(fn (array $rules) => ['sometimes', ...array_diff($rules, ['required'])], self::validationRules());
    }
}
