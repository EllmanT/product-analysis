<?php

declare(strict_types=1);

use App\Enums\InvoiceStatus;
use App\Models\Invoice;
use App\Models\InvoiceItem;

test('guests cannot list invoice items via web json', function () {
    $this->getJson(route('invoice-items.index'))->assertUnauthorized();
});

test('authenticated user can crud invoice items via web json', function () {
    $f = billingFixture();

    $invoice = Invoice::factory()->create([
        'team_id' => $f->team->id,
        'customer_id' => $f->customer->id,
        'subscription_id' => null,
        'amount' => '100.00',
        'currency' => 'USD',
        'status' => InvoiceStatus::Open,
        'due_date' => now()->addDays(7)->toDateString(),
    ]);

    $this->actingAs($f->user)
        ->getJson(route('invoice-items.index'))
        ->assertOk()
        ->assertJsonCount(0, 'data');

    $store = $this->actingAs($f->user)
        ->postJson(route('invoice-items.store'), [
            'invoice_id' => $invoice->id,
            'description' => 'Extra seat',
            'quantity' => 2,
            'unit_price' => '15.00',
            'total' => '30.00',
        ])
        ->assertCreated()
        ->assertJsonPath('data.description', 'Extra seat');

    $id = $store->json('data.id');

    $this->actingAs($f->user)
        ->getJson(route('invoice-items.show', $id))
        ->assertOk()
        ->assertJsonPath('data.quantity', 2);

    $this->actingAs($f->user)
        ->patchJson(route('invoice-items.update', $id), ['quantity' => 3])
        ->assertOk()
        ->assertJsonPath('data.quantity', 3);

    $this->actingAs($f->user)
        ->deleteJson(route('invoice-items.destroy', $id))
        ->assertNoContent();

    expect(InvoiceItem::query()->find($id))->toBeNull();
});
