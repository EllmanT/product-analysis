<?php

declare(strict_types=1);

namespace App\Data;

use App\Enums\PaymentStatus;
use App\Models\Payment;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class PaymentDto extends Data
{
    public function __construct(
        public readonly ?int $id,
        public readonly ?int $team_id,
        public readonly int $invoice_id,
        public readonly string $amount,
        public readonly string $currency,
        public readonly ?string $original_amount,
        public readonly ?string $exchange_rate,
        public readonly string $payment_method,
        public readonly PaymentStatus $status,
        public readonly ?string $transaction_reference,
        public readonly ?InvoiceDto $invoice = null,
    ) {}

    public static function fromPayment(Payment $payment): self
    {
        $payment->loadMissing([
            'invoice.customer',
            'invoice.subscription.customer',
            'invoice.subscription.plan',
        ]);

        return new self(
            id: $payment->id,
            team_id: $payment->team_id,
            invoice_id: $payment->invoice_id,
            amount: (string) $payment->amount,
            currency: $payment->currency ?? 'USD',
            original_amount: $payment->original_amount !== null ? (string) $payment->original_amount : null,
            exchange_rate: $payment->exchange_rate !== null ? (string) $payment->exchange_rate : null,
            payment_method: $payment->payment_method,
            status: $payment->status,
            transaction_reference: $payment->transaction_reference,
            invoice: $payment->invoice !== null ? InvoiceDto::from($payment->invoice) : null,
        );
    }
}
