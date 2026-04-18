<?php

declare(strict_types=1);

namespace App\Data\Api;

use App\Data\Concerns\FromValidatedRequest;
use App\Support\ApiValidationRules;
use App\Support\BillingValidationRules;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class StoreInvoiceItemData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        public readonly int $invoice_id,
        public readonly string $description,
        public readonly int $quantity,
        public readonly string $unit_price,
        public readonly string $total,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'invoice_id' => ApiValidationRules::invoiceId(),
            'description' => ['required', 'string'],
            'quantity' => ['required', 'integer', 'min:1'],
            'unit_price' => BillingValidationRules::moneyAmount(),
            'total' => BillingValidationRules::moneyAmount(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toRepositoryArray(): array
    {
        return [
            'invoice_id' => $this->invoice_id,
            'description' => $this->description,
            'quantity' => $this->quantity,
            'unit_price' => $this->unit_price,
            'total' => $this->total,
        ];
    }
}
