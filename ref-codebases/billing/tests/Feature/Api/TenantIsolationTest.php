<?php

declare(strict_types=1);

use App\Enums\BillingInterval;
use App\Enums\InvoiceStatus;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\Product;
use App\Models\Subscription;
use App\Models\User;

test('guests receive 401 on api v1 catalog and subscriptions', function () {
    $this->getJson(route('api.products.index'))->assertUnauthorized();
    $this->getJson(route('api.plans.index'))->assertUnauthorized();
    $this->getJson(route('api.subscriptions.index'))->assertUnauthorized();
});

test('users without a team receive 403', function () {
    $user = User::factory()->create(['team_id' => null]);

    $this->actingAs($user)
        ->getJson(route('api.products.index'))
        ->assertForbidden();
});

test('users cannot load another teams resources by id', function () {
    $a = billingFixture();
    $b = billingFixture();

    $foreignCustomer = Customer::factory()->create(['team_id' => $a->team->id, 'name' => 'Foreign']);
    $foreignProduct = Product::factory()->create(['team_id' => $a->team->id]);
    $foreignPlan = Plan::factory()->forProduct($foreignProduct)->create([
        'name' => 'Foreign plan',
        'billing_interval' => BillingInterval::Monthly,
        'price' => '10.00',
        'currency' => 'USD',
    ]);
    $foreignSubscription = Subscription::factory()->create([
        'team_id' => $a->team->id,
        'customer_id' => $foreignCustomer->id,
        'plan_id' => $foreignPlan->id,
    ]);
    $foreignInvoice = Invoice::factory()->create([
        'team_id' => $a->team->id,
        'customer_id' => $foreignCustomer->id,
        'subscription_id' => null,
        'amount' => '10.00',
        'currency' => 'USD',
        'status' => InvoiceStatus::Open,
        'due_date' => now()->addDays(7)->toDateString(),
    ]);
    $foreignPayment = Payment::factory()->create([
        'team_id' => $a->team->id,
        'invoice_id' => $foreignInvoice->id,
        'amount' => '10.00',
        'payment_method' => 'card',
    ]);
    $foreignItem = InvoiceItem::factory()->create([
        'invoice_id' => $foreignInvoice->id,
    ]);

    $this->actingAs($b->user)
        ->getJson(route('customers.show', $foreignCustomer))
        ->assertNotFound();

    $this->actingAs($b->user)
        ->getJson(route('api.products.show', $foreignProduct))
        ->assertNotFound();

    $this->actingAs($b->user)
        ->getJson(route('api.plans.show', $foreignPlan))
        ->assertNotFound();

    $this->actingAs($b->user)
        ->getJson(route('api.subscriptions.show', $foreignSubscription))
        ->assertNotFound();

    $this->actingAs($b->user)
        ->getJson(route('invoices.show', $foreignInvoice))
        ->assertNotFound();

    $this->actingAs($b->user)
        ->get(route('invoices.document', $foreignInvoice))
        ->assertNotFound();

    $this->actingAs($b->user)
        ->get(route('invoices.download', $foreignInvoice))
        ->assertNotFound();

    $this->actingAs($b->user)
        ->getJson(route('payments.show', $foreignPayment))
        ->assertNotFound();

    $this->actingAs($b->user)
        ->getJson(route('invoice-items.show', $foreignItem))
        ->assertNotFound();
});

test('users cannot reference another teams ids when creating subscriptions or invoices', function () {
    $a = billingFixture();
    $b = billingFixture();

    $foreignCustomer = Customer::factory()->create(['team_id' => $a->team->id]);

    $this->actingAs($b->user)
        ->postJson(route('api.subscriptions.store'), [
            'customer_id' => $foreignCustomer->id,
            'plan_id' => $b->plan->id,
            'start_date' => now()->toDateString(),
        ])
        ->assertUnprocessable();

    $this->actingAs($b->user)
        ->postJson(route('invoices.store'), [
            'customer_id' => $foreignCustomer->id,
            'subscription_id' => null,
            'amount' => '10.00',
            'currency' => 'USD',
            'status' => InvoiceStatus::Open->value,
            'due_date' => now()->addDays(7)->toDateString(),
        ])
        ->assertUnprocessable();
});

test('api product index only includes the current tenant rows', function () {
    $a = billingFixture();
    $b = billingFixture();

    Product::factory()->create(['team_id' => $a->team->id, 'name' => 'Only Team A']);

    $this->actingAs($b->user)
        ->getJson(route('api.products.index'))
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', $b->product->name);
});
