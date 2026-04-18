<?php

declare(strict_types=1);
use App\Enums\EcocashTransactionStatus;
use App\Models\EcocashTransaction;
use App\Models\Invoice;

test('ecocash notify accepts post without crashing', function () {
    $this->postJson('/api/ecocash/notify', [
        'clientCorrelator' => 'non-existent-correlator',
        'transactionOperationStatus' => 'Charged',
    ])->assertOk()
        ->assertJsonPath('status', 'ok');
});

test('ecocash notify marks transaction completed when status is COMPLETED and response SUCCEEDED', function () {
    $f = billingFixture();

    $invoice = Invoice::factory()->create([
        'customer_id' => $f->customer->id,
        'amount' => '1.00',
        'currency' => 'USD',
    ]);

    $txn = EcocashTransaction::create([
        'team_id' => $f->team->id,
        'invoice_id' => $invoice->id,
        'client_correlator' => '52b29664-179c-4901-9c43-050746a501da',
        'reference_code' => 'AXIS_TEST_1',
        'phone_number' => '0776953194',
        'local_amount' => '1.00',
        'local_currency' => 'USD',
        'status' => EcocashTransactionStatus::Pending,
        'ecocash_response' => [],
    ]);

    $this->postJson('/api/ecocash/notify', [
        'clientCorrelator' => $txn->client_correlator,
        'referenceCode' => $txn->client_correlator, // matches real-world payloads we see
        'transactionOperationStatus' => 'COMPLETED',
        'ecocashResponseCode' => 'SUCCEEDED',
        'paymentAmount' => [
            'charginginformation' => [
                'amount' => 1.00,
                'currency' => 'USD',
            ],
        ],
    ])->assertOk()
        ->assertJsonPath('status', 'ok');

    $txn->refresh();
    $invoice->refresh();

    expect($txn->status)->toBe(EcocashTransactionStatus::Completed);
    expect($txn->payment_id)->not()->toBeNull();
    expect($invoice->status->value)->toBe('paid');
});
