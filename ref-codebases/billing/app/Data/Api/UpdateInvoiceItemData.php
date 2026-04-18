<?php

declare(strict_types=1);

namespace App\Data\Api;

use App\Data\Concerns\FromValidatedRequest;
use App\Support\ApiValidationRules;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class UpdateInvoiceItemData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        public readonly ?int $invoice_id = null,
        public readonly ?string $description = null,
        public readonly ?int $quantity = null,
        public readonly ?string $unit_price = null,
        public readonly ?string $total = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'invoice_id' => array_merge(['sometimes'], ApiValidationRules::invoiceId(false)),
            'description' => ['sometimes', 'string'],
            'quantity' => ['sometimes', 'integer', 'min:1'],
            'unit_price' => ['sometimes', 'numeric', 'min:0'],
            'total' => ['sometimes', 'numeric', 'min:0'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toPayload(): array
    {
        return array_filter($this->toArray(), fn (mixed $v): bool => $v !== null);
    }
}
