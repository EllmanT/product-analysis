<?php

declare(strict_types=1);

use App\Enums\InvoiceStatus;
use App\Models\Invoice;

test('guests cannot create invoices via web json', function () {
    $this->postJson(route('invoices.store'), [])->assertUnauthorized();
});

test('authenticated user can create manual invoice and crud via web json', function () {
    $f = billingFixture();

    $store = $this->actingAs($f->user)
        ->postJson(route('invoices.store'), [
            'customer_id' => $f->customer->id,
            'subscription_id' => null,
            'amount' => '25.50',
            'currency' => 'usd',
            'status' => InvoiceStatus::Open->value,
            'due_date' => now()->addDays(7)->toDateString(),
        ])
        ->assertCreated()
        ->assertJsonPath('data.amount', '25.50');

    $id = $store->json('data.id');

    $this->actingAs($f->user)
        ->getJson(route('invoices.show', $id))
        ->assertOk()
        ->assertJsonPath('data.id', $id);

    $this->actingAs($f->user)
        ->patchJson(route('invoices.update', $id), ['amount' => '30.00'])
        ->assertOk()
        ->assertJsonPath('data.amount', '30.00');

    $this->actingAs($f->user)
        ->deleteJson(route('invoices.destroy', $id))
        ->assertNoContent();

    expect(Invoice::query()->find($id))->toBeNull();
});

test('invoice can be generated from an active subscription via web json', function () {
    $f = billingFixture();

    $sub = $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.store'), [
            'customer_id' => $f->customer->id,
            'plan_id' => $f->plan->id,
            'start_date' => now()->toDateString(),
        ])
        ->assertCreated();

    $subscriptionId = $sub->json('data.id');

    $this->actingAs($f->user)
        ->postJson(route('invoices.from-subscription', $subscriptionId), [
            'days_until_due' => 14,
        ])
        ->assertCreated()
        ->assertJsonPath('data.amount', '50.00')
        ->assertJsonPath('data.subscription_id', $subscriptionId);
});
