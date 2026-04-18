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
final class UpdateInvoiceData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        public readonly ?int $customer_id = null,
        public readonly ?int $subscription_id = null,
        public readonly ?string $amount = null,
        public readonly ?string $currency = null,
        public readonly ?InvoiceStatus $status = null,
        public readonly ?string $due_date = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'customer_id' => array_merge(['sometimes'], ApiValidationRules::customerId(false)),
            'subscription_id' => array_merge(['sometimes'], ApiValidationRules::subscriptionId(false)),
            'amount' => BillingValidationRules::optionalMoneyAmount(),
            'currency' => BillingValidationRules::currencyCode(false),
            'status' => ['sometimes', Rule::enum(InvoiceStatus::class)],
            'due_date' => ['sometimes', 'date'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toPayload(): array
    {
        $payload = array_filter($this->toArray(), fn (mixed $v): bool => $v !== null);
        if (isset($payload['currency'])) {
            $payload['currency'] = strtoupper((string) $payload['currency']);
        }

        return $payload;
    }
}
