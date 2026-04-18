<?php

declare(strict_types=1);

use App\Models\User;

test('guests cannot access team page', function () {
    $this->get(route('team.index'))->assertRedirect(route('login'));
});

test('authenticated user can view team page with users and audits', function () {
    $f = billingFixture();

    $this->actingAs($f->user)
        ->get(route('team.index'))
        ->assertOk();
});

test('authenticated user can list and create team users via web json', function () {
    $f = billingFixture();

    $this->actingAs($f->user)
        ->getJson(route('users.index'))
        ->assertOk()
        ->assertJsonCount(1, 'data');

    $this->actingAs($f->user)
        ->postJson(route('users.store'), [
            'name' => 'Second User',
            'email' => 'second@example.com',
            'password' => 'Password123!',
        ])
        ->assertCreated()
        ->assertJsonPath('data.email', 'second@example.com');

    expect(User::query()->where('email', 'second@example.com')->value('team_id'))->toBe($f->team->id);

    $this->assertDatabaseHas('audits', [
        'event' => 'created',
        'auditable_type' => User::class,
    ]);
});

test('user cannot delete own account via web json', function () {
    $f = billingFixture();

    $this->actingAs($f->user)
        ->deleteJson(route('users.destroy', $f->user))
        ->assertUnprocessable();
});
