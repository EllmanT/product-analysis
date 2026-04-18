<?php

declare(strict_types=1);

use App\Models\Invoice;

test('authenticated user can view invoice document html and download pdf', function () {
    $f = billingFixture();

    $invoice = Invoice::factory()->create([
        'customer_id' => $f->customer->id,
        'amount' => '42.00',
        'currency' => 'USD',
    ]);

    $this->actingAs($f->user)
        ->get(route('invoices.document', $invoice))
        ->assertOk()
        ->assertSee('Invoice', false)
        ->assertSee('Axis', false)
        ->assertSee('Payment options', false)
        ->assertSee('Cash', false)
        ->assertSee('EcoCash', false)
        ->assertSee((string) $invoice->id, false);

    if (! extension_loaded('gd')) {
        $this->markTestSkipped('The PHP GD extension is required for PDF generation.');
    }

    $this->actingAs($f->user)
        ->get(route('invoices.download', $invoice))
        ->assertOk()
        ->assertHeader('content-type', 'application/pdf');
});

test('browser get invoices show redirects to document', function () {
    $f = billingFixture();

    $invoice = Invoice::factory()->create([
        'customer_id' => $f->customer->id,
    ]);

    $this->actingAs($f->user)
        ->get(route('invoices.show', $invoice))
        ->assertRedirect(route('invoices.document', $invoice));
});
