<?php

declare(strict_types=1);

use App\Enums\BillingInterval;
use App\Models\Plan;

test('guests cannot list plans via api', function () {
    $this->getJson(route('api.plans.index'))->assertUnauthorized();
});

test('authenticated user can list and show plans via api', function () {
    $f = billingFixture();

    $this->actingAs($f->user)
        ->getJson(route('api.plans.index'))
        ->assertOk()
        ->assertJsonCount(1, 'data');

    $this->actingAs($f->user)
        ->getJson(route('api.plans.show', $f->plan->id))
        ->assertOk()
        ->assertJsonPath('data.name', $f->plan->name);
});

test('authenticated user can create update and delete plans via web json', function () {
    $f = billingFixture();

    $yearly = $this->actingAs($f->user)
        ->postJson(route('plans.store'), [
            'product_id' => $f->product->id,
            'name' => 'Yearly',
            'billing_interval' => BillingInterval::Yearly->value,
            'price' => '120.00',
            'currency' => 'USD',
        ])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Yearly')
        ->assertJsonPath('data.billing_interval', BillingInterval::Yearly->value);

    $this->actingAs($f->user)
        ->postJson(route('plans.store'), [
            'product_id' => $f->product->id,
            'name' => 'Lifetime',
            'billing_interval' => BillingInterval::OneTime->value,
            'price' => '199.00',
            'currency' => 'USD',
        ])
        ->assertCreated()
        ->assertJsonPath('data.billing_interval', BillingInterval::OneTime->value);

    $id = $yearly->json('data.id');

    $this->actingAs($f->user)
        ->patchJson(route('plans.update', $id), ['price' => '99.00'])
        ->assertOk()
        ->assertJsonPath('data.price', '99.00');

    $this->actingAs($f->user)
        ->deleteJson(route('plans.destroy', $id))
        ->assertNoContent();

    expect(Plan::query()->find($id))->toBeNull();
});
