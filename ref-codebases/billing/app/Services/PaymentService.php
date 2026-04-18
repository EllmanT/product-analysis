<?php

declare(strict_types=1);

namespace App\Services;

use App\Data\Api\UpdatePaymentData;
use App\Data\PaymentDto;
use App\Data\RecordPaymentInputData;
use App\Enums\InvoiceStatus;
use App\Enums\PaymentStatus;
use App\Events\InvoicePaid;
use App\Events\PaymentCompleted;
use App\Exceptions\PaymentRecordingException;
use App\Models\Invoice;
use App\Models\Payment;
use App\Repositories\Interfaces\InvoiceRepositoryInterface;
use App\Repositories\Interfaces\PaymentRepositoryInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use RuntimeException;

final class PaymentService
{
    public function __construct(
        private readonly PaymentRepositoryInterface $payments,
        private readonly InvoiceRepositoryInterface $invoices,
        private readonly ExchangeRateService $fx,
    ) {}

    /**
     * Records a payment against an invoice. Succeeded payments apply toward the balance;
     * when cumulative succeeded payments reach the invoice total, the invoice is marked paid.
     * If paid_currency is set and differs from USD, the amount is auto-converted using the
     * current exchange rate and the original amount/rate are stored alongside the payment.
     */
    public function recordPayment(RecordPaymentInputData $input): PaymentDto
    {
        // Resolve FX: convert paid_amount in paid_currency → USD
        $usdAmount = $input->amount;
        $originalAmount = null;
        $originalCurrency = null;
        $exchangeRateSnapshot = null;

        $paidCurrency = strtoupper($input->paid_currency ?? 'USD');

        if ($paidCurrency !== ExchangeRateService::BASE && $input->paid_amount !== null) {
            try {
                $rateModel = $this->fx->currentRate($paidCurrency);
                $exchangeRateSnapshot = (string) $rateModel->rate;
                $usdAmount = $this->fx->convertToUsd($input->paid_amount, $paidCurrency);
                $originalAmount = $input->paid_amount;
                $originalCurrency = $paidCurrency;
            } catch (RuntimeException $e) {
                throw PaymentRecordingException::fromMessage($e->getMessage());
            }
        }

        if ($this->compareMoney($usdAmount, '0.00') <= 0) {
            throw PaymentRecordingException::invalidAmount();
        }

        return DB::transaction(function () use ($input, $usdAmount, $originalAmount, $exchangeRateSnapshot): PaymentDto {
            /** @var Invoice $invoice */
            $invoice = Invoice::query()->lockForUpdate()->findOrFail($input->invoice_id);

            $this->assertInvoicePayable($invoice);

            $paidBefore = $this->sumSucceededPayments($invoice);
            $remaining = $this->subtractMoney((string) $invoice->amount, $paidBefore);

            if ($input->status === PaymentStatus::Succeeded) {
                if ($this->compareMoney($usdAmount, $remaining) > 0) {
                    throw PaymentRecordingException::amountExceedsBalance();
                }
            }

            $wasPaid = $invoice->status === InvoiceStatus::Paid;

            $payment = $this->payments->create([
                'invoice_id' => $input->invoice_id,
                'amount' => $usdAmount,
                'currency' => ExchangeRateService::BASE,
                'original_amount' => $originalAmount,
                'exchange_rate' => $exchangeRateSnapshot,
                'payment_method' => $input->payment_method,
                'status' => $input->status,
                'transaction_reference' => $input->transaction_reference,
            ]);

            $invoice->refresh();

            $becomesPaid = false;
            if ($input->status === PaymentStatus::Succeeded && ! $wasPaid) {
                $paidAfter = $this->sumSucceededPayments($invoice);
                if ($this->compareMoney($paidAfter, (string) $invoice->amount) >= 0) {
                    $this->invoices->update($invoice, ['status' => InvoiceStatus::Paid]);
                    $invoice->refresh();
                    $becomesPaid = true;
                }
            }

            $payment->refresh();
            $invoice->refresh();

            if ($input->status === PaymentStatus::Succeeded) {
                Event::dispatch(new PaymentCompleted($payment, $invoice));
            }

            if ($becomesPaid) {
                Event::dispatch(new InvoicePaid($invoice));
            }

            return PaymentDto::fromPayment($payment);
        });
    }

    private function assertInvoicePayable(Invoice $invoice): void
    {
        if ($invoice->status === InvoiceStatus::Paid) {
            throw PaymentRecordingException::invoiceAlreadyPaid();
        }

        if (! in_array($invoice->status, InvoiceStatus::payable(), true)) {
            throw PaymentRecordingException::invoiceNotPayable();
        }
    }

    private function sumSucceededPayments(Invoice $invoice): string
    {
        $sum = $invoice->payments()
            ->where('status', PaymentStatus::Succeeded)
            ->sum('amount');

        return $this->normalizeMoney((string) $sum);
    }

    private function normalizeMoney(string $value): string
    {
        return number_format((float) $value, 2, '.', '');
    }

    /**
     * @return int -1 if a < b, 0 if equal, 1 if a > b
     */
    private function compareMoney(string $a, string $b): int
    {
        $a = $this->normalizeMoney($a);
        $b = $this->normalizeMoney($b);

        if (function_exists('bccomp')) {
            return bccomp($a, $b, 2);
        }

        return (float) $a <=> (float) $b;
    }

    private function subtractMoney(string $total, string $paid): string
    {
        $total = $this->normalizeMoney($total);
        $paid = $this->normalizeMoney($paid);

        if (function_exists('bcsub')) {
            return $this->normalizeMoney(bcsub($total, $paid, 2));
        }

        return $this->normalizeMoney((string) ((float) $total - (float) $paid));
    }

    /**
     * @return Collection<int, PaymentDto>
     */
    public function listPayments(): Collection
    {
        return $this->payments->all()->map(
            fn (Payment $payment): PaymentDto => PaymentDto::fromPayment($payment)
        );
    }

    public function getPayment(Payment $payment): PaymentDto
    {
        return PaymentDto::fromPayment($payment);
    }

    public function updatePayment(Payment $payment, UpdatePaymentData $data): PaymentDto
    {
        $this->payments->update($payment, $data->toPayload());

        return PaymentDto::fromPayment($payment->refresh());
    }

    public function deletePayment(Payment $payment): void
    {
        $this->payments->delete($payment);
    }
}
