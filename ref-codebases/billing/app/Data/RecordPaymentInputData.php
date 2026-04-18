<?php

declare(strict_types=1);

namespace App\Data;

use App\Data\Concerns\FromValidatedRequest;
use App\Enums\PaymentStatus;
use App\Support\ApiValidationRules;
use App\Support\BillingValidationRules;
use Illuminate\Validation\Rule;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class RecordPaymentInputData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        public readonly int $invoice_id,
        public readonly string $amount,
        public readonly string $payment_method,
        public readonly PaymentStatus $status = PaymentStatus::Succeeded,
        public readonly ?string $transaction_reference = null,
        /** Currency the payer used (e.g. ZWG). Null / 'USD' means no conversion needed. */
        public readonly ?string $paid_currency = null,
        /** Amount in paid_currency before conversion to USD. */
        public readonly ?string $paid_amount = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'invoice_id' => ApiValidationRules::invoiceId(),
            'amount' => BillingValidationRules::positiveMoneyAmount(),
            'payment_method' => ['required', 'string', 'max:255'],
            'status' => ['sometimes', Rule::enum(PaymentStatus::class)],
            'transaction_reference' => ['nullable', 'string', 'max:255'],
            'paid_currency' => ['nullable', 'string', 'max:10'],
            'paid_amount' => ['nullable', 'numeric', 'min:0.01'],
        ];
    }
}
