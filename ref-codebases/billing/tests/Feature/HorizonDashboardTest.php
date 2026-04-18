<?php

declare(strict_types=1);

test('authenticated user can open horizon when email is allowed', function () {
    $f = billingFixture();

    config(['horizon.allowed_emails' => $f->user->email]);

    $this->actingAs($f->user)->get('/horizon')->assertOk();
});

test('horizon allows any team user when application env binding is local', function () {
    $f = billingFixture();
    $app = app();
    $previous = $app['env'];

    $app['env'] = 'local';
    config(['horizon.allowed_emails' => '']);

    try {
        $this->actingAs($f->user)->get('/horizon')->assertOk();
    } finally {
        $app['env'] = $previous;
    }
});
