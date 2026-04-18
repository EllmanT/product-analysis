<?php

declare(strict_types=1);

use App\Enums\BillingInterval;
use App\Models\Customer;
use App\Models\Plan;
use App\Models\Subscription;

test('guests cannot list subscriptions', function () {
    $this->getJson(route('api.subscriptions.index'))->assertUnauthorized();
});

test('authenticated user can create show and delete subscriptions', function () {
    $f = billingFixture();

    $this->actingAs($f->user)
        ->getJson(route('api.subscriptions.index'))
        ->assertOk()
        ->assertJsonCount(0, 'data');

    $store = $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.store'), [
            'customer_id' => $f->customer->id,
            'plan_id' => $f->plan->id,
            'start_date' => now()->toDateString(),
        ])
        ->assertCreated()
        ->assertJsonPath('data.status', 'active');

    $id = $store->json('data.id');

    $this->actingAs($f->user)
        ->getJson(route('api.subscriptions.show', $id))
        ->assertOk()
        ->assertJsonPath('data.id', $id);

    $this->actingAs($f->user)
        ->deleteJson(route('api.subscriptions.destroy', $id))
        ->assertNoContent();

    expect(Subscription::query()->find($id))->toBeNull();
});

test('authenticated user can create subscription with nested customer payload', function () {
    $f = billingFixture();

    $store = $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.store'), [
            'customer' => [
                'name' => 'Nested Customer',
                'email' => 'nested@example.com',
            ],
            'plan_id' => $f->plan->id,
            'start_date' => now()->toDateString(),
        ])
        ->assertCreated()
        ->assertJsonPath('data.status', 'active');

    $subId = $store->json('data.id');
    $subscription = Subscription::query()->findOrFail($subId);
    $customer = Customer::query()->findOrFail($subscription->customer_id);

    expect($customer->name)->toBe('Nested Customer')
        ->and($customer->email)->toBe('nested@example.com')
        ->and($customer->team_id)->toBe($f->team->id);
});

test('subscription trialing can be activated', function () {
    $f = billingFixture();

    $store = $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.store'), [
            'customer_id' => $f->customer->id,
            'plan_id' => $f->plan->id,
            'start_date' => now()->toDateString(),
            'trial_end' => now()->addDays(7)->toIso8601String(),
        ])
        ->assertCreated()
        ->assertJsonPath('data.status', 'trialing');

    $id = $store->json('data.id');

    $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.activate', $id))
        ->assertOk()
        ->assertJsonPath('data.status', 'active');
});

test('one-time subscription has no end date and renew requires new_end_date', function () {
    $f = billingFixture();

    $plan = Plan::factory()->forProduct($f->product)->create([
        'name' => 'Single',
        'billing_interval' => BillingInterval::OneTime,
        'price' => '25.00',
        'currency' => 'USD',
    ]);

    $store = $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.store'), [
            'customer_id' => $f->customer->id,
            'plan_id' => $plan->id,
            'start_date' => now()->toDateString(),
        ])
        ->assertCreated()
        ->assertJsonPath('data.status', 'active');

    $id = $store->json('data.id');

    expect(Subscription::query()->findOrFail($id)->end_date)->toBeNull();

    $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.renew', $id), [])
        ->assertUnprocessable()
        ->assertJsonPath('message', 'One-time plans cannot be renewed automatically; provide new_end_date.');

    $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.renew', $id), [
            'new_end_date' => now()->addYear()->toDateString(),
        ])
        ->assertOk();
});

test('active subscription can be renewed and canceled', function () {
    $f = billingFixture();

    $store = $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.store'), [
            'customer_id' => $f->customer->id,
            'plan_id' => $f->plan->id,
            'start_date' => now()->toDateString(),
        ])
        ->assertCreated();

    $id = $store->json('data.id');

    $beforeEnd = Subscription::query()->findOrFail($id)->end_date;
    expect($beforeEnd)->not->toBeNull();

    $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.renew', $id))
        ->assertOk();

    $afterRenew = Subscription::query()->findOrFail($id);
    expect($afterRenew->end_date)->not->toBeNull();
    expect($afterRenew->end_date->toDateString())->not->toBe($beforeEnd->toDateString());

    $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.cancel', $id), [])
        ->assertOk()
        ->assertJsonPath('data.status', 'cancelled');
});

test('authenticated user can list subscriptions for a customer', function () {
    $f = billingFixture();

    $store = $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.store'), [
            'customer_id' => $f->customer->id,
            'plan_id' => $f->plan->id,
            'start_date' => now()->toDateString(),
        ])
        ->assertCreated();

    $id = $store->json('data.id');

    $this->actingAs($f->user)
        ->getJson(route('api.customers.subscriptions', $f->customer->id))
        ->assertOk()
        ->assertJsonPath('data.0.id', $id);
});

test('authenticated user can patch a subscription', function () {
    $f = billingFixture();

    $store = $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.store'), [
            'customer_id' => $f->customer->id,
            'plan_id' => $f->plan->id,
            'start_date' => now()->toDateString(),
        ])
        ->assertCreated();

    $id = $store->json('data.id');

    $this->actingAs($f->user)
        ->patchJson(route('api.subscriptions.update', $id), [
            'trial_end' => null,
        ])
        ->assertOk()
        ->assertJsonPath('data.id', $id);
});

test('subscription transition status returns 422 when transition is invalid', function () {
    $f = billingFixture();

    $store = $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.store'), [
            'customer_id' => $f->customer->id,
            'plan_id' => $f->plan->id,
            'start_date' => now()->toDateString(),
        ])
        ->assertCreated();

    $id = $store->json('data.id');

    $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.transition-status', $id), [
            'status' => 'trialing',
        ])
        ->assertStatus(422);
});

test('renewing a trialing subscription returns 422', function () {
    $f = billingFixture();

    $store = $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.store'), [
            'customer_id' => $f->customer->id,
            'plan_id' => $f->plan->id,
            'start_date' => now()->toDateString(),
            'trial_end' => now()->addDays(5)->toIso8601String(),
        ])
        ->assertCreated()
        ->assertJsonPath('data.status', 'trialing');

    $id = $store->json('data.id');

    $this->actingAs($f->user)
        ->postJson(route('api.subscriptions.renew', $id))
        ->assertStatus(422);
});
