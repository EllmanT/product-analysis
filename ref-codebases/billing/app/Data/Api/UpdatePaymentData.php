<?php

declare(strict_types=1);

namespace App\Data\Api;

use App\Data\Concerns\FromValidatedRequest;
use App\Enums\PaymentStatus;
use App\Support\ApiValidationRules;
use App\Support\BillingValidationRules;
use Illuminate\Validation\Rule;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class UpdatePaymentData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        public readonly ?int $invoice_id = null,
        public readonly ?string $amount = null,
        public readonly ?string $payment_method = null,
        public readonly ?PaymentStatus $status = null,
        public readonly ?string $transaction_reference = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'invoice_id' => array_merge(['sometimes'], ApiValidationRules::invoiceId(false)),
            'amount' => BillingValidationRules::optionalMoneyAmount(),
            'payment_method' => ['sometimes', 'string', 'max:255'],
            'status' => ['sometimes', Rule::enum(PaymentStatus::class)],
            'transaction_reference' => ['nullable', 'string', 'max:255'],
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
