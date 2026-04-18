<?php

declare(strict_types=1);

use App\Models\Product;

test('guests cannot list products via api', function () {
    $this->getJson(route('api.products.index'))->assertUnauthorized();
});

test('authenticated user can list and show products via api', function () {
    $f = billingFixture();

    $this->actingAs($f->user)
        ->getJson(route('api.products.index'))
        ->assertOk()
        ->assertJsonCount(1, 'data');

    $this->actingAs($f->user)
        ->getJson(route('api.products.show', $f->product->id))
        ->assertOk()
        ->assertJsonPath('data.name', $f->product->name);
});

test('authenticated user can create update and delete products via web json', function () {
    $f = billingFixture();

    $store = $this->actingAs($f->user)
        ->postJson(route('products.store'), [
            'name' => 'Widget',
            'description' => 'A widget',
        ])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Widget');

    $id = $store->json('data.id');

    $this->actingAs($f->user)
        ->patchJson(route('products.update', $id), ['name' => 'Super Widget'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Super Widget');

    $this->actingAs($f->user)
        ->deleteJson(route('products.destroy', $id))
        ->assertNoContent();

    expect(Product::query()->find($id))->toBeNull();
});
