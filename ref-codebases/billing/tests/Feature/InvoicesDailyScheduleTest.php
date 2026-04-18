<?php

declare(strict_types=1);

use App\Enums\InvoiceStatus;
use App\Mail\InvoiceOverdueReminderMail;
use App\Models\Invoice;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Mail;

test('daily schedule marks past-due open invoices overdue and queues reminder mail', function () {
    Mail::fake();

    $f = billingFixture();
    $customer = $f->customer;
    $customer->update(['email' => 'client@example.com']);

    $invoice = Invoice::factory()->create([
        'team_id' => $f->team->id,
        'customer_id' => $customer->id,
        'status' => InvoiceStatus::Open,
        'due_date' => now()->subDay()->toDateString(),
    ]);

    $this->artisan('invoices:run-daily-schedule')->assertSuccessful();

    $invoice->refresh();
    expect($invoice->status)->toBe(InvoiceStatus::Overdue);

    Mail::assertQueued(InvoiceOverdueReminderMail::class, function (InvoiceOverdueReminderMail $mail) use ($invoice): bool {
        return $mail->invoice->id === $invoice->id;
    });
});

test('daily schedule skips mail when customer has no email', function () {
    Mail::fake();

    $f = billingFixture();
    $customer = $f->customer;
    $customer->update(['email' => null]);

    $invoice = Invoice::factory()->create([
        'team_id' => $f->team->id,
        'customer_id' => $customer->id,
        'status' => InvoiceStatus::Open,
        'due_date' => now()->subDay()->toDateString(),
    ]);

    $this->artisan('invoices:run-daily-schedule')->assertSuccessful();

    $invoice->refresh();
    expect($invoice->status)->toBe(InvoiceStatus::Overdue);
    Mail::assertNothingQueued();
});

test('schedule registers daily invoice command', function () {
    Artisan::call('schedule:list');

    expect(Artisan::output())->toContain('invoices:run-daily-schedule');
});
