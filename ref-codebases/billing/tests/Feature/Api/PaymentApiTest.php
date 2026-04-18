<?php

declare(strict_types=1);

use App\Models\Payment;

test('guests cannot record payments via web json', function () {
    $this->postJson(route('payments.store'), [])->assertUnauthorized();
});

test('authenticated user can record update and delete payments via web json', function () {
    $f = billingFixture();

    $sub = $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.store'), [
            'customer_id' => $f->customer->id,
            'plan_id' => $f->plan->id,
            'start_date' => now()->toDateString(),
        ])
        ->assertCreated();

    $subscriptionId = $sub->json('data.id');

    $inv = $this->actingAs($f->user)
        ->postJson(route('invoices.from-subscription', $subscriptionId), [])
        ->assertCreated();

    $invoiceId = $inv->json('data.id');

    $pay = $this->actingAs($f->user)
        ->postJson(route('payments.store'), [
            'invoice_id' => $invoiceId,
            'amount' => '50.00',
            'payment_method' => 'card',
            'status' => 'succeeded',
        ])
        ->assertCreated()
        ->assertJsonPath('data.amount', '50.00');

    $paymentId = $pay->json('data.id');

    $this->actingAs($f->user)
        ->getJson(route('payments.show', $paymentId))
        ->assertOk();

    $this->actingAs($f->user)
        ->getJson(route('invoices.show', $invoiceId))
        ->assertOk()
        ->assertJsonPath('data.status', 'paid');

    $this->actingAs($f->user)
        ->patchJson(route('payments.update', $paymentId), [
            'transaction_reference' => 'ref-123',
        ])
        ->assertOk();

    $this->actingAs($f->user)
        ->deleteJson(route('payments.destroy', $paymentId))
        ->assertNoContent();

    expect(Payment::query()->find($paymentId))->toBeNull();
});

test('partial payment leaves invoice open until balance is met', function () {
    $f = billingFixture();

    $sub = $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.store'), [
            'customer_id' => $f->customer->id,
            'plan_id' => $f->plan->id,
            'start_date' => now()->toDateString(),
        ])
        ->assertCreated();

    $invoiceId = $this->actingAs($f->user)
        ->postJson(route('invoices.from-subscription', $sub->json('data.id')), [])
        ->assertCreated()
        ->json('data.id');

    $this->actingAs($f->user)
        ->postJson(route('payments.store'), [
            'invoice_id' => $invoiceId,
            'amount' => '20.00',
            'payment_method' => 'card',
            'status' => 'succeeded',
        ])
        ->assertCreated();

    $this->actingAs($f->user)
        ->getJson(route('invoices.show', $invoiceId))
        ->assertOk()
        ->assertJsonPath('data.status', 'open');

    $this->actingAs($f->user)
        ->postJson(route('payments.store'), [
            'invoice_id' => $invoiceId,
            'amount' => '30.00',
            'payment_method' => 'card',
            'status' => 'succeeded',
        ])
        ->assertCreated();

    $this->actingAs($f->user)
        ->getJson(route('invoices.show', $invoiceId))
        ->assertOk()
        ->assertJsonPath('data.status', 'paid');
});
