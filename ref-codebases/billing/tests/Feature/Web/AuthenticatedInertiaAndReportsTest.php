<?php

declare(strict_types=1);

test('authenticated user can load main shell and report pages', function () {
    $f = billingFixture();

    $routes = [
        'dashboard',
        'customers.index',
        'products.index',
        'plans.index',
        'subscriptions.index',
        'invoices.index',
        'payments.index',
        'team.index',
        'audit.index',
        'users.index',
        'billing-intervals.index',
        'exchange-rates.index',
        'api-keys.index',
        'reports.revenue',
        'reports.customers',
        'reports.subscriptions',
        'reports.invoices',
    ];

    foreach ($routes as $name) {
        $this->actingAs($f->user)->get(route($name))->assertOk();
    }

    $this->actingAs($f->user)->get(route('customers.show', $f->customer))->assertOk();
});
