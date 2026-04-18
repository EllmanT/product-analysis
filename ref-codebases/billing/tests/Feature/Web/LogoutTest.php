<?php

declare(strict_types=1);

test('authenticated user can log out', function () {
    $f = billingFixture();

    $this->actingAs($f->user)
        ->post(route('logout'))
        ->assertRedirect(route('home'));

    $this->assertGuest();
});
