<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Data\RecordPaymentInputData;
use App\Enums\PaymentStatus;
use App\Models\Invoice;
use App\Models\Payment;
use App\Services\ExceptionReporter;
use App\Services\ExchangeRateService;
use App\Services\PaymentService;
use App\Services\ZimswitchCopyPayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

final class ZimswitchController extends Controller
{
    public function __construct(
        private readonly ZimswitchCopyPayService $copyPay,
        private readonly PaymentService $paymentService,
        private readonly ExchangeRateService $fx,
        private readonly ExceptionReporter $exceptions,
    ) {}

    /**
     * Start Copy & Pay: create OPPWA checkout for an open invoice balance.
     *
     * POST /zimswitch/checkout
     * Body: { invoice_id, payment_type? }
     */
    public function prepare(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'invoice_id' => ['required', 'integer', 'exists:invoices,id'],
            'payment_type' => ['sometimes', 'nullable', 'string', 'max:20'],
        ]);

        $entityId = config('zimswitch.entity_id');
        if (! is_string($entityId) || $entityId === '') {
            return response()->json([
                'message' => 'ZimSwitch entity id is not configured (ZIMSWITCH_ENTITY_ID).',
            ], 503);
        }

        /** @var Invoice $invoice */
        $invoice = Invoice::query()->findOrFail($validated['invoice_id']);

        $paidSum = (string) $invoice->payments()
            ->where('status', PaymentStatus::Succeeded)
            ->sum('amount');

        $remaining = number_format(max(0, (float) $invoice->amount - (float) $paidSum), 2, '.', '');

        if ((float) $remaining <= 0) {
            return response()->json([
                'message' => 'Invoice has no remaining balance to pay.',
            ], 422);
        }

        $paymentType = $validated['payment_type'] ?? config('zimswitch.payment_type', 'DB');
        if (! is_string($paymentType) || $paymentType === '') {
            $paymentType = 'DB';
        }

        try {
            $created = $this->copyPay->createCheckout(
                $remaining,
                $invoice->currency,
                $entityId,
                $paymentType,
            );
        } catch (Throwable $e) {
            $this->exceptions->report($e, [
                'zimswitch' => [
                    'invoice_id' => $invoice->id,
                ],
            ]);

            Log::channel('zimswitch')->error('ZimSwitch checkout failed', [
                'invoice_id' => $invoice->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }

        $checkoutId = $created['id'];
        $teamId = (int) $invoice->team_id;

        Cache::put(
            $this->cacheKey($teamId, $checkoutId),
            [
                'invoice_id' => $invoice->id,
                'team_id' => $teamId,
                'amount' => $remaining,
                'currency' => strtoupper($invoice->currency),
            ],
            now()->addSeconds((int) config('zimswitch.checkout_cache_ttl', 3600)),
        );

        Log::channel('zimswitch')->info('ZimSwitch checkout created', [
            'invoice_id' => $invoice->id,
            'checkout_id' => $checkoutId,
            'amount' => $remaining,
            'currency' => $invoice->currency,
        ]);

        return response()->json([
            'message' => $created['result']['description'] ?? 'Checkout created.',
            'response_code' => $created['result']['code'] ?? null,
            'checkout_id' => $checkoutId,
            'entity_id' => $entityId,
        ]);
    }

    /**
     * Poll OPPWA payment status; on success records a payment for the cached invoice (idempotent).
     *
     * GET /zimswitch/checkout/{checkoutId}/status?invoice_id=
     */
    public function status(Request $request, string $checkoutId): JsonResponse
    {
        $validated = $request->validate([
            'invoice_id' => ['required', 'integer', 'exists:invoices,id'],
        ]);

        $teamId = (int) ($request->attributes->get('tenant_id') ?? auth()->user()?->team_id ?? 0);
        if ($teamId === 0) {
            return response()->json(['message' => 'Tenant context missing.'], 403);
        }

        $cached = Cache::get($this->cacheKey($teamId, $checkoutId));
        if (! is_array($cached)) {
            return response()->json([
                'message' => 'Checkout session expired or unknown. Create a new checkout.',
            ], 404);
        }

        if ((int) $cached['invoice_id'] !== (int) $validated['invoice_id']) {
            return response()->json([
                'message' => 'Invoice does not match this checkout.',
            ], 422);
        }

        $entityId = config('zimswitch.entity_id');
        if (! is_string($entityId) || $entityId === '') {
            return response()->json([
                'message' => 'ZimSwitch entity id is not configured (ZIMSWITCH_ENTITY_ID).',
            ], 503);
        }

        $interpreted = $this->copyPay->fetchPaymentStatus($checkoutId, $entityId);

        if ($interpreted['success'] === true) {
            $already = Payment::query()
                ->where('invoice_id', (int) $cached['invoice_id'])
                ->where('transaction_reference', $checkoutId)
                ->exists();

            if (! $already) {
                try {
                    $input = $this->buildRecordPaymentInput(
                        (int) $cached['invoice_id'],
                        (string) $cached['amount'],
                        (string) $cached['currency'],
                        $checkoutId,
                    );
                    $this->paymentService->recordPayment($input);
                    Cache::forget($this->cacheKey($teamId, $checkoutId));

                    Log::channel('zimswitch')->info('ZimSwitch payment recorded', [
                        'checkout_id' => $checkoutId,
                        'invoice_id' => $cached['invoice_id'],
                    ]);
                } catch (Throwable $e) {
                    Log::channel('zimswitch')->error('ZimSwitch payment recording failed', [
                        'checkout_id' => $checkoutId,
                        'invoice_id' => $cached['invoice_id'],
                        'error' => $e->getMessage(),
                    ]);

                    return response()->json([
                        ...$interpreted,
                        'recorded' => false,
                        'record_error' => $e->getMessage(),
                    ], 422);
                }
            } else {
                Cache::forget($this->cacheKey($teamId, $checkoutId));
            }

            return response()->json([
                ...$interpreted,
                'recorded' => ! $already,
            ]);
        }

        return response()->json($interpreted);
    }

    private function cacheKey(int $teamId, string $checkoutId): string
    {
        return 'zimswitch:checkout:'.$teamId.':'.sha1($checkoutId);
    }

    private function buildRecordPaymentInput(int $invoiceId, string $amount, string $currency, string $checkoutId): RecordPaymentInputData
    {
        $currency = strtoupper($currency);

        if ($currency === ExchangeRateService::BASE) {
            return RecordPaymentInputData::from([
                'invoice_id' => $invoiceId,
                'amount' => $amount,
                'payment_method' => 'zimswitch',
                'transaction_reference' => $checkoutId,
            ]);
        }

        $usdAmount = $this->fx->convertToUsd($amount, $currency);

        return RecordPaymentInputData::from([
            'invoice_id' => $invoiceId,
            'amount' => $usdAmount,
            'payment_method' => 'zimswitch',
            'transaction_reference' => $checkoutId,
            'paid_currency' => $currency,
            'paid_amount' => $amount,
        ]);
    }
}
