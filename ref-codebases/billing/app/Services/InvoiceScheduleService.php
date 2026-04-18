<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\InvoiceStatus;
use App\Mail\InvoiceOverdueReminderMail;
use App\Models\Invoice;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

final class InvoiceScheduleService
{
    /**
     * Promote open invoices whose due date is before today to {@see InvoiceStatus::Overdue}.
     */
    public function markOverdueInvoices(): int
    {
        return Invoice::query()
            ->where('status', InvoiceStatus::Open)
            ->whereDate('due_date', '<', now()->startOfDay())
            ->update(['status' => InvoiceStatus::Overdue]);
    }

    /**
     * Queue one reminder email per overdue invoice when the customer has an email address.
     */
    public function queueOverdueInvoiceReminderEmails(): int
    {
        $invoices = Invoice::query()
            ->with(['customer', 'invoiceItems'])
            ->where('status', InvoiceStatus::Overdue)
            ->get();

        $queued = 0;

        foreach ($invoices as $invoice) {
            $email = $invoice->customer?->email;
            if (! is_string($email) || $email === '') {
                Log::channel('single')->warning('Skipped overdue invoice reminder: customer has no email.', [
                    'invoice_id' => $invoice->id,
                    'customer_id' => $invoice->customer_id,
                ]);

                continue;
            }

            Mail::to($email)->queue(new InvoiceOverdueReminderMail($invoice));
            $queued++;
        }

        return $queued;
    }
}
