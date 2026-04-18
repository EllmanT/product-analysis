<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Invoice;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

final class InvoiceOverdueReminderMail extends Mailable implements ShouldQueue
{
    use Queueable;
    use SerializesModels;

    public function __construct(public Invoice $invoice)
    {
        $this->invoice->loadMissing(['customer', 'invoiceItems']);
    }

    public function envelope(): Envelope
    {
        $app = config('app.name', 'Billing');

        return new Envelope(
            subject: sprintf('[%s] Invoice #%d reminder — payment overdue', $app, $this->invoice->id),
        );
    }

    public function content(): Content
    {
        $customer = $this->invoice->customer;

        return new Content(
            markdown: 'mail.invoice-overdue-reminder',
            with: [
                'customerName' => $customer?->name ?? 'Customer',
                'invoiceId' => $this->invoice->id,
                'amount' => (string) $this->invoice->amount,
                'currency' => strtoupper((string) $this->invoice->currency),
                'dueDate' => $this->invoice->due_date?->format('Y-m-d') ?? '—',
            ],
        );
    }
}
