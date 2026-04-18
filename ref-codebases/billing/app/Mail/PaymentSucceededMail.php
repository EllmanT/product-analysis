<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

final class PaymentSucceededMail extends Mailable implements ShouldQueue
{
    use Queueable;
    use SerializesModels;

    public function __construct(
        public Payment $payment,
        public Invoice $invoice,
    ) {
        $this->payment->loadMissing(['team']);
        $this->invoice->loadMissing(['customer']);
    }

    public function envelope(): Envelope
    {
        $app = config('app.name', 'Billing');

        return new Envelope(
            subject: sprintf('[%s] Payment received — invoice #%d', $app, $this->invoice->id),
        );
    }

    public function content(): Content
    {
        $p = $this->payment;
        $inv = $this->invoice;

        $originalLine = null;
        if ($p->original_amount !== null) {
            $originalLine = (string) $p->original_amount;
            if ($p->exchange_rate !== null) {
                $originalLine .= ' (rate '.$p->exchange_rate.' → USD)';
            }
        }

        return new Content(
            markdown: 'mail.payment-succeeded',
            with: [
                'paymentId' => $p->id,
                'invoiceId' => $inv->id,
                'customerName' => $inv->customer?->name ?? '—',
                'teamName' => $p->team?->name ?? '—',
                'amountUsd' => (string) $p->amount,
                'invoiceCurrency' => strtoupper((string) $inv->currency),
                'invoiceAmount' => (string) $inv->amount,
                'paymentMethod' => (string) $p->payment_method,
                'transactionReference' => $p->transaction_reference ?? '—',
                'originalLine' => $originalLine,
                'recordedAt' => $p->created_at?->toIso8601String() ?? '',
            ],
        );
    }
}
