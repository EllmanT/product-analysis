<?php

declare(strict_types=1);

test('guest is redirected from dashboard to login', function () {
    $this->get(route('dashboard'))->assertRedirect(route('login'));
});

test('login page loads for guests', function () {
    $this->get(route('login'))->assertOk();
});
