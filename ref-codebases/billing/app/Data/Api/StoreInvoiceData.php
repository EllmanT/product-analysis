<?php

declare(strict_types=1);

namespace App\Data\Api;

use App\Data\Concerns\FromValidatedRequest;
use App\Enums\InvoiceStatus;
use App\Support\ApiValidationRules;
use App\Support\BillingValidationRules;
use Illuminate\Validation\Rule;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class StoreInvoiceData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        public readonly int $customer_id,
        public readonly ?int $subscription_id,
        public readonly string $amount,
        public readonly string $currency,
        public readonly InvoiceStatus $status,
        public readonly string $due_date,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'customer_id' => ApiValidationRules::customerId(),
            'subscription_id' => ApiValidationRules::subscriptionId(),
            'amount' => BillingValidationRules::moneyAmount(),
            'currency' => BillingValidationRules::currencyCode(),
            'status' => ['required', Rule::enum(InvoiceStatus::class)],
            'due_date' => ['required', 'date'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toRepositoryArray(): array
    {
        return [
            'customer_id' => $this->customer_id,
            'subscription_id' => $this->subscription_id,
            'amount' => $this->amount,
            'currency' => strtoupper($this->currency),
            'status' => $this->status,
            'due_date' => $this->due_date,
        ];
    }
}
