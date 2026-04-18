<?php

declare(strict_types=1);

use App\Models\Customer;

test('guests cannot create customers via web json', function () {
    $this->postJson(route('customers.store'), ['name' => 'Acme'])->assertUnauthorized();
});

test('authenticated user can create show update and delete customers via web json', function () {
    $f = billingFixture();

    $store = $this->actingAs($f->user)
        ->postJson(route('customers.store'), ['name' => 'Acme Corp'])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Acme Corp');

    $id = $store->json('data.id');

    $this->actingAs($f->user)
        ->getJson(route('customers.show', $id))
        ->assertOk()
        ->assertJsonPath('data.name', 'Acme Corp');

    $this->actingAs($f->user)
        ->patchJson(route('customers.update', $id), ['name' => 'Acme Ltd'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Acme Ltd');

    $this->actingAs($f->user)
        ->deleteJson(route('customers.destroy', $id))
        ->assertNoContent();

    expect(Customer::query()->find($id))->toBeNull();
});
