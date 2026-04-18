<?php

declare(strict_types=1);

use App\Enums\EcocashTransactionStatus;
use App\Models\EcocashTransaction;
use App\Models\Invoice;
use Illuminate\Support\Facades\Http;

test('ecocash initiate succeeds when api accepts push and exchange rate exists', function () {
    $f = billingFixture();

    $this->actingAs($f->user)
        ->postJson(route('exchange-rates.store'), [
            'currency' => 'ZWG',
            'rate' => '25.5',
            'effective_date' => now()->toDateString(),
        ])
        ->assertCreated();

    config([
        'ecocash.api_url' => 'https://ecocash.test/api/pay',
        'ecocash.username' => 'u',
        'ecocash.password' => 'p',
    ]);

    Http::fake([
        'https://ecocash.test/*' => Http::response([
            'transactionOperationStatus' => 'Pending',
        ], 200),
    ]);

    $invoice = Invoice::factory()->create([
        'customer_id' => $f->customer->id,
        'amount' => '100.00',
        'currency' => 'USD',
    ]);

    $this->actingAs($f->user)
        ->postJson(route('ecocash.initiate'), [
            'invoice_id' => $invoice->id,
            'phone_number' => '0771000000',
        ])
        ->assertOk()
        ->assertJsonPath('ecocash_status', 'Pending');

    expect(EcocashTransaction::query()->where('invoice_id', $invoice->id)->exists())->toBeTrue();
});

test('ecocash initiate returns 422 when ecocash api errors', function () {
    $f = billingFixture();

    $this->actingAs($f->user)
        ->postJson(route('exchange-rates.store'), [
            'currency' => 'ZWG',
            'rate' => '20',
            'effective_date' => now()->toDateString(),
        ])
        ->assertCreated();

    config([
        'ecocash.api_url' => 'https://ecocash.test/api/pay',
        'ecocash.username' => 'u',
        'ecocash.password' => 'p',
    ]);

    Http::fake([
        'https://ecocash.test/*' => Http::response(['message' => 'Denied'], 500),
    ]);

    $invoice = Invoice::factory()->create(['customer_id' => $f->customer->id]);

    $this->actingAs($f->user)
        ->postJson(route('ecocash.initiate'), [
            'invoice_id' => $invoice->id,
            'phone_number' => '0771000000',
        ])
        ->assertStatus(422);
});

test('ecocash status returns 404 for unknown reference', function () {
    $f = billingFixture();

    $this->actingAs($f->user)
        ->getJson(route('ecocash.status', ['referenceCode' => 'AXIS_MISSING']))
        ->assertNotFound();
});

test('ecocash status returns transaction payload', function () {
    $f = billingFixture();
    $invoice = Invoice::factory()->create(['customer_id' => $f->customer->id]);

    EcocashTransaction::create([
        'team_id' => $f->team->id,
        'invoice_id' => $invoice->id,
        'client_correlator' => 'cc-1',
        'reference_code' => 'AXIS_STATUS_1',
        'phone_number' => '077',
        'local_amount' => '100.00',
        'local_currency' => 'ZWG',
        'status' => EcocashTransactionStatus::Pending,
        'ecocash_response' => [],
    ]);

    $this->actingAs($f->user)
        ->getJson(route('ecocash.status', ['referenceCode' => 'AXIS_STATUS_1']))
        ->assertOk()
        ->assertJsonPath('reference_code', 'AXIS_STATUS_1')
        ->assertJsonPath('status', 'pending');
});
