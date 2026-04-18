<?php

namespace App\Data;

use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
class InvoiceLineData extends Data
{
    public function __construct(
        public int $lineNo,
        public string $lineType,
        public ?string $hsCode = null,
        public string $description,
        public float $quantity,
        public float $unitPrice,
        public string $taxCode,
        public float $taxPercent,
        public float $vatAmount = 0,
        public ?float $lineTotalExcl = null,
        public float $lineTotalIncl,
        public ?string $productId = null,
    ) {}

    /** @return array<string, array<int, string>> */
    public static function validationRules(): array
    {
        return [
            'invoice_id' => ['required', 'uuid'],
            'line_no' => ['required', 'integer'],
            'line_type' => ['required', 'string', 'in:Sale,Discount'],
            'hs_code' => ['nullable', 'string', 'max:20'],
            'description' => ['required', 'string', 'max:500'],
            'quantity' => ['required', 'numeric'],
            'unit_price' => ['required', 'numeric'],
            'tax_code' => ['required', 'string', 'in:A,B,C'],
            'tax_percent' => ['required', 'numeric'],
            'vat_amount' => ['numeric'],
            'line_total_excl' => ['nullable', 'numeric'],
            'line_total_incl' => ['required', 'numeric'],
            'product_id' => ['nullable', 'uuid'],
        ];
    }

    /** @return array<string, array<int, string>> */
    public static function validationRulesForUpdate(): array
    {
        return array_map(fn (array $rules) => ['sometimes', ...array_diff($rules, ['required'])], self::validationRules());
    }
}
