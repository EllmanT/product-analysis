<?php

declare(strict_types=1);

namespace App\Services;

use App\Data\RecordPaymentInputData;
use App\Enums\EcocashTransactionStatus;
use App\Enums\PaymentStatus;
use App\Models\CheckoutSession;
use App\Models\EcocashTransaction;
use App\Models\Invoice;
use App\Models\Subscription;
use App\Models\User;
use App\Notifications\BillingNotification;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

final class EcoCashService
{
    public function __construct(
        private readonly ExchangeRateService $fx,
        private readonly PaymentService $paymentService,
    ) {}

    /**
     * Initiate an EcoCash debit push to the given phone number for the full outstanding
     * balance of the invoice (converted from USD to ZWG using the current exchange rate).
     *
     * Returns an array with the keys:
     *   - reference_code  (string) – unique reference to poll status
     *   - client_correlator (string)
     *   - local_amount    (string) – amount in local_currency
     *   - local_currency  (string)
     *   - ecocash_status  (string) – raw transactionOperationStatus from EcoCash
     *
     * @throws RuntimeException if no exchange rate is configured for the currency
     * @throws ConnectionException if the HTTP call to EcoCash times out
     */
    public function initiatePayment(Invoice $invoice, string $phoneNumber, ?string $currency = null): array
    {
        $currency = strtoupper($currency ?? config('ecocash.currency', 'ZWG'));

        // Convert USD invoice amount → local currency
        $localAmount = $this->fx->convertFromUsd((string) $invoice->amount, $currency);

        $clientCorrelator = (string) Str::uuid();
        $referenceCode = 'AXIS'.now()->getTimestampMs();

        $payload = $this->buildPayload($phoneNumber, (float) $localAmount, $currency, $clientCorrelator, $referenceCode);

        Log::channel('ecocash')->info('EcoCash: initiating payment', [
            'invoice_id' => $invoice->id,
            'client_correlator' => $clientCorrelator,
            'reference_code' => $referenceCode,
            'local_amount' => $localAmount,
            'local_currency' => $currency,
            'phone' => $phoneNumber,
            'notify_url' => (string) data_get($payload, 'notifyUrl'),
        ]);

        $response = Http::withBasicAuth(
            (string) config('ecocash.username'),
            (string) config('ecocash.password'),
        )
            ->withHeaders(['Content-Type' => 'application/json', 'Accept' => 'application/json'])
            ->post((string) config('ecocash.api_url'), $payload);

        $data = $response->json() ?? [];

        Log::channel('ecocash')->info('EcoCash: external API response (initiate)', [
            'http_status' => $response->status(),
            'payload' => $data,
            'raw_body' => $response->body(),
        ]);

        // Persist transaction regardless of EcoCash's immediate response so the
        // notify callback can always look it up by client_correlator.
        $txn = EcocashTransaction::create([
            'team_id' => $invoice->team_id,
            'invoice_id' => $invoice->id,
            'client_correlator' => $clientCorrelator,
            'reference_code' => $referenceCode,
            'phone_number' => $phoneNumber,
            'local_amount' => $localAmount,
            'local_currency' => $currency,
            'status' => EcocashTransactionStatus::Pending,
            'ecocash_response' => $data,
        ]);

        if (! $response->successful()) {
            Log::channel('ecocash')->error('EcoCash: initiation failed', [
                'client_correlator' => $clientCorrelator,
                'http_status' => $response->status(),
                'response' => $data,
            ]);

            throw new RuntimeException(
                $data['message'] ?? "EcoCash returned HTTP {$response->status()}"
            );
        }

        Log::channel('ecocash')->info('EcoCash: initiation successful', [
            'client_correlator' => $clientCorrelator,
            'ecocash_status' => $data['transactionOperationStatus'] ?? null,
        ]);

        return [
            'reference_code' => $referenceCode,
            'client_correlator' => $clientCorrelator,
            'local_amount' => $localAmount,
            'local_currency' => $currency,
            'ecocash_status' => $data['transactionOperationStatus'] ?? 'Pending',
            'transaction_id' => $txn->id,
        ];
    }

    /**
     * Process an incoming EcoCash notification webhook.
     *
     * EcoCash posts a payload that includes `clientCorrelator` and
     * `transactionOperationStatus` ("Charged" = success, "DeliveryImpossible" = failed).
     *
     * When the status is "Charged" we record the payment against the invoice and mark
     * the transaction completed.  We set the tenant context on the request so the
     * global team scope functions correctly without an authenticated session.
     */
    public function handleNotification(array $payload, ?string $rawBody = null): void
    {
        // EcoCash notifications can contain sensitive values (e.g. merchantPin).
        // Log a redacted payload and avoid storing the raw body verbatim.
        $logPayload = $payload;
        foreach (['merchantPin', 'merchant_pin'] as $sensitiveKey) {
            if (array_key_exists($sensitiveKey, $logPayload)) {
                $logPayload[$sensitiveKey] = '***';
            }
        }

        Log::channel('ecocash')->info('EcoCash: external notification payload', [
            'payload' => $logPayload,
            'raw_body_present' => is_string($rawBody) && $rawBody !== '',
        ]);

        $clientCorrelator = $payload['clientCorrelator'] ?? null;
        $referenceCode = $payload['referenceCode'] ?? null;
        $operationStatus = strtoupper((string) ($payload['transactionOperationStatus'] ?? ''));
        $responseCode = strtoupper((string) ($payload['ecocashResponseCode'] ?? ''));

        /** @var EcocashTransaction|null $txn */
        $txn = null;
        if (is_string($clientCorrelator) && $clientCorrelator !== '') {
            $txn = EcocashTransaction::withoutGlobalScopes()
                ->where('client_correlator', $clientCorrelator)
                ->first();
        }
        if ($txn === null && is_string($referenceCode) && $referenceCode !== '') {
            $txn = EcocashTransaction::withoutGlobalScopes()
                ->where('reference_code', $referenceCode)
                ->first();
        }

        if ($txn === null) {
            Log::channel('ecocash')->error('EcoCash: no transaction found', [
                'client_correlator' => $clientCorrelator,
                'reference_code' => $referenceCode,
            ]);

            return;
        }

        // Update raw response from EcoCash
        $txn->ecocash_response = $payload;
        $txn->save();

        if ($txn->status !== EcocashTransactionStatus::Pending) {
            Log::channel('ecocash')->info('EcoCash: notification skipped — transaction not pending', [
                'client_correlator' => $clientCorrelator,
                'current_status' => $txn->status->value,
            ]);

            return;
        }

        $isSuccess = in_array($operationStatus, ['CHARGED', 'COMPLETED', 'SUCCESS', 'SUCCEEDED'], true)
            || $responseCode === 'SUCCEEDED';

        $isFailure = in_array($operationStatus, ['DELIVERYIMPOSSIBLE', 'CANCELLED', 'FAILED'], true)
            || $responseCode === 'FAILED';

        if ($isSuccess) {
            $this->completeTransaction($txn);
        } elseif ($isFailure) {
            $txn->status = EcocashTransactionStatus::Failed;
            $txn->save();

            Log::channel('ecocash')->info('EcoCash: payment failed/cancelled', [
                'client_correlator' => $txn->client_correlator,
                'reference_code' => $txn->reference_code,
                'transaction_operation_status' => $operationStatus,
                'ecocash_response_code' => $responseCode,
            ]);

            $statusSummary = $operationStatus !== '' ? $operationStatus : ($responseCode !== '' ? $responseCode : 'FAILED');
            $this->failRelatedCheckoutSession($txn, $statusSummary);
            $this->notifyTeamPaymentFailed($txn, $statusSummary);
        }
    }

    /**
     * Return the current status of a transaction by its reference_code.
     * The caller must be tenant-scoped (normal authenticated request).
     */
    public function getTransaction(string $referenceCode): ?EcocashTransaction
    {
        return EcocashTransaction::query()
            ->where('reference_code', $referenceCode)
            ->first();
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    private function completeTransaction(EcocashTransaction $txn): void
    {
        // Inject tenant context so HasTeamScope global scopes work without a session.
        request()->attributes->set('tenant_id', $txn->team_id);

        try {
            $input = RecordPaymentInputData::from([
                'invoice_id' => $txn->invoice_id,
                'amount' => $this->fx->convertToUsd((string) $txn->local_amount, $txn->local_currency),
                'payment_method' => 'ecocash',
                'status' => PaymentStatus::Succeeded,
                'transaction_reference' => $txn->reference_code,
                'paid_currency' => $txn->local_currency,
                'paid_amount' => (string) $txn->local_amount,
            ]);

            $paymentDto = $this->paymentService->recordPayment($input);

            $txn->status = EcocashTransactionStatus::Completed;
            $txn->payment_id = $paymentDto->id;
            $txn->completed_at = now();
            $txn->save();

            // Mark the related subscription's payment platform as EcoCash
            $invoice = Invoice::withoutGlobalScopes()->with('subscription')->find($txn->invoice_id);
            if ($invoice?->subscription instanceof Subscription) {
                $invoice->subscription->update(['payment_platform' => 'ecocash']);
            }

            Log::channel('ecocash')->info('EcoCash: payment recorded successfully', [
                'client_correlator' => $txn->client_correlator,
                'payment_id' => $paymentDto->id,
                'invoice_id' => $txn->invoice_id,
            ]);
        } catch (Throwable $e) {
            Log::channel('ecocash')->error('EcoCash: failed to record payment after successful notification', [
                'client_correlator' => $txn->client_correlator,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
        }
    }

    private function failRelatedCheckoutSession(EcocashTransaction $txn, string $ecocashStatus): void
    {
        /** @var Invoice|null $invoice */
        $invoice = Invoice::withoutGlobalScopes()->find($txn->invoice_id);
        if (! $invoice instanceof Invoice || $invoice->checkout_session_id === null) {
            return;
        }

        /** @var CheckoutSession|null $session */
        $session = CheckoutSession::withoutGlobalScopes()->find($invoice->checkout_session_id);
        if (! $session instanceof CheckoutSession) {
            return;
        }

        if (in_array($session->status, ['succeeded', 'failed'], true)) {
            return;
        }

        request()->attributes->set('tenant_id', $session->team_id);

        $session->payment_platform = 'ecocash';
        $session->provider_reference = $txn->reference_code;
        $session->status = 'failed';
        $session->save();

        Log::channel('ecocash')->info('EcoCash: checkout session marked failed', [
            'checkout_session_id' => $session->id,
            'public_id' => $session->public_id,
            'invoice_id' => $invoice->id,
            'reference_code' => $txn->reference_code,
            'ecocash_status' => $ecocashStatus,
        ]);
    }

    private function notifyTeamPaymentFailed(EcocashTransaction $txn, string $ecocashStatus): void
    {
        $users = User::query()->where('team_id', $txn->team_id)->get();
        if ($users->isEmpty()) {
            return;
        }

        Notification::send($users, new BillingNotification('Payment failed', [
            'Invoice' => $txn->invoice_id,
            'Method' => 'ecocash',
            'Reference' => $txn->reference_code,
            'Status' => $ecocashStatus,
        ]));
    }

    /**
     * @return array<string, mixed>
     */
    private function buildPayload(
        string $phoneNumber,
        float $amount,
        string $currency,
        string $clientCorrelator,
        string $referenceCode,
    ): array {
        $notifyUrl = (string) config('ecocash.notify_url', '');
        if ($notifyUrl !== '' && str_starts_with($notifyUrl, '/')) {
            $base = rtrim((string) config('app.url', ''), '/');
            if ($base !== '') {
                $notifyUrl = $base.$notifyUrl;
            }
        }

        return [
            'clientCorrelator' => $clientCorrelator,
            'notifyUrl' => $notifyUrl,
            'referenceCode' => $referenceCode,
            'tranType' => 'MER',
            'endUserId' => $phoneNumber,
            'remarks' => 'AXIS BILLING ONLINE PAYMENT',
            'transactionOperationStatus' => 'Charged',
            'paymentAmount' => [
                'charginginformation' => [
                    'amount' => $amount,
                    'currency' => $currency,
                    'description' => 'Axis Billing Invoice Payment',
                ],
                'chargeMetaData' => [
                    'channel' => 'WEB',
                    'purchaseCategoryCode' => 'Online Payment',
                    'onBeHalfOf' => 'Axis Billing',
                ],
            ],
            'merchantCode' => config('ecocash.merchant_code'),
            'merchantPin' => config('ecocash.merchant_pin'),
            'merchantNumber' => $phoneNumber,
            'currencyCode' => $currency,
            'countryCode' => 'ZW',
            'terminalID' => config('ecocash.terminal_id'),
            'location' => config('ecocash.location'),
            'superMerchantName' => config('ecocash.super_merchant'),
            'merchantName' => config('ecocash.merchant_name'),
        ];
    }
}
