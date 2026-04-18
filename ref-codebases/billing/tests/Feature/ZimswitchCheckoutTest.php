<?php

declare(strict_types=1);

use App\Enums\PaymentStatus;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    config([
        'zimswitch.base_url' => 'https://zs.test',
        'zimswitch.authorization_token' => 'test-token',
        'zimswitch.entity_id' => 'entity-1',
        'zimswitch.payment_type' => 'DB',
    ]);
});

test('zimswitch prepare returns 503 when entity id is not configured', function () {
    $f = billingFixture();
    config(['zimswitch.entity_id' => '']);

    $invoice = Invoice::factory()->create(['customer_id' => $f->customer->id]);

    $this->actingAs($f->user)
        ->postJson(route('zimswitch.checkout'), ['invoice_id' => $invoice->id])
        ->assertStatus(503)
        ->assertJsonPath('message', 'ZimSwitch entity id is not configured (ZIMSWITCH_ENTITY_ID).');
});

test('zimswitch prepare returns 422 when invoice has no remaining balance', function () {
    $f = billingFixture();

    $invoice = Invoice::factory()->create([
        'customer_id' => $f->customer->id,
        'amount' => '25.00',
    ]);

    Payment::factory()->create([
        'invoice_id' => $invoice->id,
        'amount' => '25.00',
        'status' => PaymentStatus::Succeeded,
    ]);

    $this->actingAs($f->user)
        ->postJson(route('zimswitch.checkout'), ['invoice_id' => $invoice->id])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Invoice has no remaining balance to pay.');
});

test('zimswitch prepare creates checkout and caches session', function () {
    $f = billingFixture();

    Http::fake([
        'https://zs.test/v1/checkouts*' => Http::response([
            'id' => 'checkout-abc',
            'result' => ['code' => '000.000.000', 'description' => 'OK'],
        ], 200),
    ]);

    $invoice = Invoice::factory()->create([
        'customer_id' => $f->customer->id,
        'amount' => '40.00',
    ]);

    $this->actingAs($f->user)
        ->postJson(route('zimswitch.checkout'), [
            'invoice_id' => $invoice->id,
            'payment_type' => '',
        ])
        ->assertOk()
        ->assertJsonPath('checkout_id', 'checkout-abc')
        ->assertJsonPath('entity_id', 'entity-1');

    $key = 'zimswitch:checkout:'.$f->team->id.':'.sha1('checkout-abc');
    expect(Cache::get($key))->toBeArray()
        ->and(Cache::get($key)['invoice_id'])->toBe($invoice->id);
});

test('zimswitch prepare returns 422 when copy pay api fails', function () {
    $f = billingFixture();

    Http::fake([
        'https://zs.test/v1/checkouts*' => Http::response([
            'result' => ['description' => 'Declined'],
        ], 422),
    ]);

    $invoice = Invoice::factory()->create(['customer_id' => $f->customer->id]);

    $this->actingAs($f->user)
        ->postJson(route('zimswitch.checkout'), ['invoice_id' => $invoice->id])
        ->assertStatus(422);
});

test('zimswitch status returns 403 when user has no team', function () {
    $invoice = Invoice::factory()->create();
    $user = User::factory()->create(['team_id' => null]);

    $this->actingAs($user)
        ->getJson(
            route('zimswitch.checkout.status', ['checkoutId' => 'x']).'?invoice_id='.$invoice->id
        )
        ->assertForbidden();
});

test('zimswitch status returns 404 when checkout is not cached', function () {
    $f = billingFixture();
    $invoice = Invoice::factory()->create(['customer_id' => $f->customer->id]);

    $this->actingAs($f->user)
        ->getJson(
            route('zimswitch.checkout.status', ['checkoutId' => 'missing']).'?invoice_id='.$invoice->id
        )
        ->assertNotFound();
});

test('zimswitch status returns 422 when invoice does not match checkout cache', function () {
    $f = billingFixture();
    $invoiceA = Invoice::factory()->create(['customer_id' => $f->customer->id]);
    $invoiceB = Invoice::factory()->create(['customer_id' => $f->customer->id]);

    $checkoutId = 'chk-mismatch';
    Cache::put(
        'zimswitch:checkout:'.$f->team->id.':'.sha1($checkoutId),
        [
            'invoice_id' => $invoiceA->id,
            'team_id' => $f->team->id,
            'amount' => '10.00',
            'currency' => 'USD',
        ],
        3600,
    );

    $this->actingAs($f->user)
        ->getJson(
            route('zimswitch.checkout.status', ['checkoutId' => $checkoutId]).'?invoice_id='.$invoiceB->id
        )
        ->assertStatus(422);
});

test('zimswitch status returns pending when payment result code is still pending', function () {
    $f = billingFixture();
    $invoice = Invoice::factory()->create([
        'customer_id' => $f->customer->id,
        'amount' => '15.00',
    ]);

    Http::fake(function (Request $request) {
        $url = $request->url();
        if (str_contains($url, '/payment')) {
            return Http::response([
                'result' => ['code' => '000.200.000'],
            ], 200);
        }

        return Http::response([
            'id' => 'chk-pay',
            'result' => ['code' => '000.000.000'],
        ], 200);
    });

    $this->actingAs($f->user)
        ->postJson(route('zimswitch.checkout'), ['invoice_id' => $invoice->id])
        ->assertOk();

    $this->actingAs($f->user)
        ->getJson(
            route('zimswitch.checkout.status', ['checkoutId' => 'chk-pay']).'?invoice_id='.$invoice->id
        )
        ->assertOk()
        ->assertJsonPath('payment_status', 'pending');

    expect(
        Payment::query()
            ->where('invoice_id', $invoice->id)
            ->where('transaction_reference', 'chk-pay')
            ->exists()
    )->toBeFalse();
});

test('zimswitch status records payment when gateway reports success', function () {
    $f = billingFixture();
    $invoice = Invoice::factory()->create([
        'customer_id' => $f->customer->id,
        'amount' => '18.00',
    ]);

    Http::fake(function (Request $request) {
        $url = $request->url();
        if (str_contains($url, '/payment')) {
            return Http::response([
                'result' => ['code' => '000.000.000'],
            ], 200);
        }

        return Http::response([
            'id' => 'chk-ok',
            'result' => ['code' => '000.000.000'],
        ], 200);
    });

    $this->actingAs($f->user)
        ->postJson(route('zimswitch.checkout'), ['invoice_id' => $invoice->id])
        ->assertOk();

    $this->actingAs($f->user)
        ->getJson(
            route('zimswitch.checkout.status', ['checkoutId' => 'chk-ok']).'?invoice_id='.$invoice->id
        )
        ->assertOk()
        ->assertJsonPath('payment_status', 'success')
        ->assertJsonPath('recorded', true);

    expect(
        Payment::query()
            ->where('invoice_id', $invoice->id)
            ->where('transaction_reference', 'chk-ok')
            ->exists()
    )->toBeTrue();
});

test('zimswitch status returns recorded false when payment already exists for checkout', function () {
    $f = billingFixture();
    $invoice = Invoice::factory()->create([
        'customer_id' => $f->customer->id,
        'amount' => '12.00',
    ]);

    $checkoutId = 'chk-dup';

    Cache::put(
        'zimswitch:checkout:'.$f->team->id.':'.sha1($checkoutId),
        [
            'invoice_id' => $invoice->id,
            'team_id' => $f->team->id,
            'amount' => '12.00',
            'currency' => 'USD',
        ],
        3600,
    );

    Payment::factory()->create([
        'invoice_id' => $invoice->id,
        'amount' => '12.00',
        'status' => PaymentStatus::Succeeded,
        'transaction_reference' => $checkoutId,
    ]);

    Http::fake([
        'https://zs.test/v1/checkouts/*/payment*' => Http::response([
            'result' => ['code' => '000.000.000'],
        ], 200),
    ]);

    $this->actingAs($f->user)
        ->getJson(
            route('zimswitch.checkout.status', ['checkoutId' => $checkoutId]).'?invoice_id='.$invoice->id
        )
        ->assertOk()
        ->assertJsonPath('recorded', false)
        ->assertJsonPath('success', true);
});
