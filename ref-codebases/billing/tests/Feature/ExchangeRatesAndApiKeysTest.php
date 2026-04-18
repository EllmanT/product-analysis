<?php

declare(strict_types=1);

use App\Models\ApiKey;

test('authenticated user can create and delete an exchange rate', function () {
    $f = billingFixture();

    $created = $this->actingAs($f->user)
        ->postJson(route('exchange-rates.store'), [
            'currency' => 'EUR',
            'rate' => '1.10',
            'effective_date' => now()->toDateString(),
            'notes' => 'test',
        ])
        ->assertCreated()
        ->json('id');

    $this->actingAs($f->user)
        ->deleteJson(route('exchange-rates.destroy', $created))
        ->assertOk();
});

test('authenticated user can create and revoke an api key', function () {
    $f = billingFixture();

    $this->actingAs($f->user)
        ->postJson(route('api-keys.store'), [
            'name' => 'CI key',
            'product_ids' => [$f->product->id],
        ])
        ->assertCreated()
        ->assertJsonStructure(['key']);

    $id = ApiKey::query()->where('team_id', $f->team->id)->value('id');
    expect($id)->not->toBeNull();

    $this->actingAs($f->user)
        ->deleteJson(route('api-keys.destroy', $id))
        ->assertOk();

    expect(ApiKey::query()->find($id))->toBeNull();
});
