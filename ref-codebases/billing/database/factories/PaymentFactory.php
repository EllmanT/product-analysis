<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\PaymentStatus;
use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Payment>
 */
final class PaymentFactory extends Factory
{
    protected $model = Payment::class;

    public function definition(): array
    {
        return [
            'invoice_id' => Invoice::factory(),
            'amount' => '10.00',
            'payment_method' => 'card',
            'status' => PaymentStatus::Succeeded,
            'transaction_reference' => null,
        ];
    }

    public function configure(): static
    {
        return $this->afterMaking(function (Payment $payment): void {
            if ($payment->invoice_id === null) {
                return;
            }

            $invoice = Invoice::query()->find($payment->invoice_id);
            if ($invoice !== null) {
                $payment->team_id = $invoice->team_id;
            }
        });
    }
}
