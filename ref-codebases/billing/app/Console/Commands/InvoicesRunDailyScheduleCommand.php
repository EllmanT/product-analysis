<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\InvoiceScheduleService;
use Illuminate\Console\Command;

final class InvoicesRunDailyScheduleCommand extends Command
{
    protected $signature = 'invoices:run-daily-schedule';

    protected $description = 'Mark past-due open invoices as overdue and queue daily reminder emails to customers.';

    public function handle(InvoiceScheduleService $scheduleService): int
    {
        $marked = $scheduleService->markOverdueInvoices();
        $queued = $scheduleService->queueOverdueInvoiceReminderEmails();

        $this->info("Marked {$marked} invoice(s) overdue; queued {$queued} reminder email(s).");

        return self::SUCCESS;
    }
}
