<?php

declare(strict_types=1);

use App\Enums\BillingInterval;
use App\Models\Plan;
use App\Models\Product;

test('api key is scoped to selected products for product and plan endpoints', function () {
    $f = billingFixture();

    // Extra product/plan under the same team
    $otherProduct = Product::factory()->create([
        'team_id' => $f->team->id,
        'name' => 'Other product',
    ]);
    $otherPlan = Plan::factory()->forProduct($otherProduct)->create([
        'name' => 'Other plan',
        'billing_interval' => BillingInterval::Monthly,
        'price' => '5.00',
        'currency' => 'USD',
    ]);

    // Create API key limited to the fixture product only
    $rawKey = $this->actingAs($f->user)
        ->postJson(route('api-keys.store'), [
            'name' => 'External system',
            'product_ids' => [$f->product->id],
        ])
        ->assertCreated()
        ->json('key');

    expect(is_string($rawKey) && $rawKey !== '')->toBeTrue();

    $headers = ['X-API-Key' => $rawKey];

    $this->getJson(route('api.products.index'), $headers)
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $f->product->id);

    $this->getJson(route('api.plans.index'), $headers)
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $f->plan->id);

    // Allowed show works
    $this->getJson(route('api.plans.show', $f->plan->id), $headers)
        ->assertOk()
        ->assertJsonPath('data.id', $f->plan->id);

    // Disallowed resources should 404 even within same team
    $this->getJson(route('api.products.show', $otherProduct->id), $headers)->assertNotFound();
    $this->getJson(route('api.plans.show', $otherPlan->id), $headers)->assertNotFound();
});
