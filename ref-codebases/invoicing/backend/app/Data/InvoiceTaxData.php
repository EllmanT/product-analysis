<?php

namespace App\Data;

use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
class InvoiceTaxData extends Data
{
    public function __construct(
        public string $invoiceId,
        public string $taxCode, // A, B, C
        public float $taxPercent,
        public float $salesAmountWithTax,
        public float $taxAmount,
    ) {}

    /** @return array<string, array<int, string>> */
    public static function validationRules(): array
    {
        return [
            'invoice_id' => ['required', 'uuid'],
            'tax_code' => ['required', 'string', 'in:A,B,C'],
            'tax_percent' => ['required', 'numeric'],
            'sales_amount_with_tax' => ['required', 'numeric'],
            'tax_amount' => ['required', 'numeric'],
        ];
    }

    /** @return array<string, array<int, string>> */
    public static function validationRulesForUpdate(): array
    {
        return array_map(fn (array $rules) => ['sometimes', ...array_diff($rules, ['required'])], self::validationRules());
    }
}
