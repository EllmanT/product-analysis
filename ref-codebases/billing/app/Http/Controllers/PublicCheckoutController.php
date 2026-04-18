<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Data\RecordPaymentInputData;
use App\Enums\InvoiceStatus;
use App\Enums\PaymentStatus;
use App\Models\CheckoutSession;
use App\Models\Invoice;
use App\Models\Payment;
use App\Services\EcoCashService;
use App\Services\ExceptionReporter;
use App\Services\ExchangeRateService;
use App\Services\OmariService;
use App\Services\PaymentService;
use App\Services\ZimswitchCopyPayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

final class PublicCheckoutController extends Controller
{
    public function __construct(
        private readonly ZimswitchCopyPayService $copyPay,
        private readonly PaymentService $payments,
        private readonly ExchangeRateService $fx,
        private readonly EcoCashService $ecocash,
        private readonly OmariService $omari,
        private readonly ExceptionReporter $exceptions,
    ) {}

    public function show(string $publicId): Response|RedirectResponse
    {
        /** @var CheckoutSession $session */
        $session = CheckoutSession::withoutGlobalScopes()
            ->where('public_id', $publicId)
            ->firstOrFail();

        request()->attributes->set('tenant_id', $session->team_id);

        $session->loadMissing(['plan.product', 'invoice']);

        if ($session->status === 'succeeded') {
            return redirect()->route('public.checkout.complete', ['publicId' => $session->public_id]);
        }

        $platforms = is_array($session->plan->payment_platforms) ? $session->plan->payment_platforms : [];
        $zimswitchOptions = is_array(config('zimswitch.payment_options')) ? config('zimswitch.payment_options') : [];

        return Inertia::render('public-checkout/Show', [
            'session' => [
                'public_id' => $session->public_id,
                'status' => $session->status,
            ],
            'plan' => [
                'id' => $session->plan->id,
                'name' => $session->plan->name,
                'product_name' => $session->plan->product?->name,
                'billing_interval' => (string) $session->plan->billing_interval,
                'payment_platforms' => $platforms,
            ],
            'invoice' => [
                'id' => $session->invoice->id,
                'amount' => (string) $session->invoice->amount,
                'currency' => strtoupper((string) $session->invoice->currency),
            ],
            'platforms' => $platforms,
            'zimswitchOptions' => $zimswitchOptions,
            'urls' => [
                'zimswitch_start' => route('public.checkout.zimswitch.start', ['publicId' => $session->public_id]),
                'ecocash_form' => route('public.checkout.ecocash.form', ['publicId' => $session->public_id]),
                'omari_form' => route('public.checkout.omari.form', ['publicId' => $session->public_id]),
            ],
        ]);
    }

    public function status(string $publicId): JsonResponse
    {
        /** @var CheckoutSession $session */
        $session = CheckoutSession::withoutGlobalScopes()
            ->where('public_id', $publicId)
            ->firstOrFail();

        request()->attributes->set('tenant_id', $session->team_id);

        /** @var Invoice $invoice */
        $invoice = Invoice::withoutGlobalScopes()->findOrFail($session->invoice_id);

        return response()->json([
            'id' => $session->public_id,
            'status' => $session->status,
            'payment_platform' => $session->payment_platform,
            'invoice_status' => $invoice->status->value,
            'paid' => $invoice->status === InvoiceStatus::Paid,
        ]);
    }

    public function ecocashForm(string $publicId): Response
    {
        /** @var CheckoutSession $session */
        $session = CheckoutSession::withoutGlobalScopes()
            ->where('public_id', $publicId)
            ->firstOrFail();

        request()->attributes->set('tenant_id', $session->team_id);

        $session->loadMissing(['plan.product', 'invoice']);

        return Inertia::render('public-checkout/EcoCash', [
            'session' => [
                'public_id' => $session->public_id,
                'status' => $session->status,
            ],
            'plan' => [
                'name' => $session->plan->name,
                'product_name' => $session->plan->product?->name,
            ],
            'invoice' => [
                'amount' => (string) $session->invoice->amount,
                'currency' => strtoupper((string) $session->invoice->currency),
            ],
            'exchange' => [
                // Used by the UI for ZWG display conversion
                'zwg_rate' => (string) ($this->fx->currentRate('ZWG')?->rate ?? '0'),
            ],
            'urls' => [
                'start' => route('public.checkout.ecocash.start', ['publicId' => $session->public_id]),
                'back' => route('public.checkout.show', ['publicId' => $session->public_id]),
            ],
        ]);
    }

    public function startEcocash(Request $request, string $publicId): RedirectResponse
    {
        /** @var CheckoutSession $session */
        $session = CheckoutSession::withoutGlobalScopes()
            ->where('public_id', $publicId)
            ->firstOrFail();

        request()->attributes->set('tenant_id', $session->team_id);

        $validated = $request->validate([
            'phone_number' => ['required', 'string', 'max:20'],
            'currency' => ['required', 'string', 'in:USD,ZWG'],
        ]);

        /** @var Invoice $invoice */
        $invoice = Invoice::withoutGlobalScopes()->findOrFail($session->invoice_id);

        $result = $this->ecocash->initiatePayment(
            $invoice,
            $validated['phone_number'],
            $validated['currency'],
        );

        $session->payment_platform = 'ecocash';
        $session->provider_reference = (string) $result['reference_code'];
        $session->status = 'processing';
        $session->save();

        return redirect()->route('public.checkout.ecocash.wait', ['publicId' => $session->public_id]);
    }

    public function ecocashWait(string $publicId): Response
    {
        /** @var CheckoutSession $session */
        $session = CheckoutSession::withoutGlobalScopes()
            ->where('public_id', $publicId)
            ->firstOrFail();

        request()->attributes->set('tenant_id', $session->team_id);

        $session->loadMissing(['plan.product', 'invoice']);

        return Inertia::render('public-checkout/EcoCashWait', [
            'session' => [
                'public_id' => $session->public_id,
                'status' => $session->status,
                'provider_reference' => $session->provider_reference,
            ],
            'plan' => [
                'name' => $session->plan->name,
                'product_name' => $session->plan->product?->name,
            ],
            'invoice' => [
                'amount' => (string) $session->invoice->amount,
                'currency' => strtoupper((string) $session->invoice->currency),
            ],
            'urls' => [
                'complete' => route('public.checkout.complete', ['publicId' => $session->public_id]),
                'status' => route('public.checkout.status', ['publicId' => $session->public_id]),
                'back' => route('public.checkout.show', ['publicId' => $session->public_id]),
            ],
        ]);
    }

    /**
     * Start OPPWA (ZimSwitch CopyPay) hosted payment widget for this checkout session.
     */
    public function startZimswitch(Request $request, string $publicId): RedirectResponse
    {
        /** @var CheckoutSession $session */
        $session = CheckoutSession::withoutGlobalScopes()
            ->where('public_id', $publicId)
            ->firstOrFail();

        request()->attributes->set('tenant_id', $session->team_id);

        /** @var Invoice $invoice */
        $invoice = Invoice::withoutGlobalScopes()->findOrFail($session->invoice_id);

        if ($invoice->status === InvoiceStatus::Paid) {
            return redirect()->route('public.checkout.complete', ['publicId' => $session->public_id]);
        }

        $validated = $request->validate([
            'option' => ['required', 'string', 'max:50'],
        ]);

        $options = config('zimswitch.payment_options');
        $option = is_array($options) ? ($options[$validated['option']] ?? null) : null;
        $entityId = is_array($option) ? ($option['entity_id'] ?? null) : null;
        $dataBrands = is_array($option) ? ($option['data_brands'] ?? null) : null;

        if (! is_string($entityId) || $entityId === '' || ! is_string($dataBrands) || $dataBrands === '') {
            throw new RuntimeException('Invalid ZimSwitch payment option.');
        }

        Log::channel('zimswitch')->info('ZimSwitch: creating checkout (hosted)', [
            'checkout_session_public_id' => $session->public_id,
            'invoice_id' => $invoice->id,
            'option' => $validated['option'],
            'entity_id' => $entityId,
            'currency' => $invoice->currency,
            'amount' => (string) $invoice->amount,
        ]);

        $created = $this->copyPay->createCheckout((string) $invoice->amount, $invoice->currency, $entityId, config('zimswitch.payment_type', 'DB'));

        $session->provider_checkout_id = $created['id'];
        $session->payment_platform = 'zimswitch';
        $session->provider_reference = $validated['option']; // store option key
        $session->status = 'processing';
        $session->metadata = array_merge((array) ($session->metadata ?? []), [
            'zimswitch' => [
                'option' => $validated['option'],
                'entity_id' => $entityId,
                'checkout_id' => $created['id'],
                'prepare_result' => $created['result'] ?? null,
            ],
        ]);
        $session->save();

        Log::channel('zimswitch')->info('ZimSwitch: checkout created (hosted)', [
            'checkout_session_public_id' => $session->public_id,
            'invoice_id' => $invoice->id,
            'checkout_id' => $created['id'],
            'result_code' => data_get($created, 'result.code'),
        ]);

        return redirect()->route('public.checkout.zimswitch.widget', [
            'publicId' => $session->public_id,
        ]);
    }

    public function zimswitchWidget(string $publicId): Response
    {
        /** @var CheckoutSession $session */
        $session = CheckoutSession::withoutGlobalScopes()
            ->where('public_id', $publicId)
            ->firstOrFail();

        request()->attributes->set('tenant_id', $session->team_id);
        $session->loadMissing(['plan.product', 'invoice']);

        $options = config('zimswitch.payment_options');
        $option = is_array($options) ? ($options[$session->provider_reference ?? ''] ?? null) : null;
        $dataBrands = is_array($option) ? ($option['data_brands'] ?? null) : null;
        $dataBrands = is_string($dataBrands) && $dataBrands !== '' ? $dataBrands : 'VISA MASTER PRIVATE_LABEL';

        return Inertia::render('public-checkout/ZimswitchWidget', [
            'session' => [
                'public_id' => $session->public_id,
                'status' => $session->status,
                'provider_reference' => $session->provider_reference,
            ],
            'checkoutId' => $session->provider_checkout_id,
            'dataBrands' => $dataBrands,
            'baseUrl' => rtrim((string) config('zimswitch.base_url', ''), '/'),
            'returnUrl' => route('public.checkout.zimswitch.return', ['publicId' => $session->public_id]),
        ]);
    }

    /**
     * OPPWA redirects here with ?id={checkoutId}. We verify status and then redirect to completion page.
     */
    public function zimswitchReturn(Request $request, string $publicId): RedirectResponse
    {
        /** @var CheckoutSession $session */
        $session = CheckoutSession::withoutGlobalScopes()
            ->where('public_id', $publicId)
            ->firstOrFail();

        request()->attributes->set('tenant_id', $session->team_id);

        $checkoutId = (string) $request->query('id', '');
        if ($checkoutId === '') {
            $session->status = 'failed';
            $session->metadata = array_merge((array) ($session->metadata ?? []), [
                'zimswitch' => array_merge((array) data_get($session->metadata, 'zimswitch', []), [
                    'status' => [
                        'payment_status' => 'failed',
                        'result_code' => null,
                        'message' => 'Payment status response missing checkout id.',
                    ],
                ]),
            ]);
            $session->save();

            return redirect()->route('public.checkout.complete', ['publicId' => $session->public_id]);
        }

        $options = config('zimswitch.payment_options');
        $opt = is_array($options) ? ($options[$session->provider_reference ?? ''] ?? null) : null;
        $entityId = is_array($opt) ? ($opt['entity_id'] ?? null) : null;
        if (! is_string($entityId) || $entityId === '') {
            throw new RuntimeException('ZimSwitch entity id is not configured for this option.');
        }

        Log::channel('zimswitch')->info('ZimSwitch: fetching payment status (hosted return)', [
            'checkout_session_public_id' => $session->public_id,
            'invoice_id' => $session->invoice_id,
            'checkout_id' => $checkoutId,
            'entity_id' => $entityId,
        ]);

        $interpreted = $this->copyPay->fetchPaymentStatus($checkoutId, $entityId);

        // Record a payment against the invoice on success (idempotent by transaction_reference).
        if ($interpreted['success'] === true) {
            $already = Payment::withoutGlobalScopes()
                ->where('invoice_id', $session->invoice_id)
                ->where('transaction_reference', $checkoutId)
                ->exists();

            if (! $already) {
                /** @var Invoice $invoice */
                $invoice = Invoice::withoutGlobalScopes()->findOrFail($session->invoice_id);

                $amountUsd = strtoupper($invoice->currency) === ExchangeRateService::BASE
                    ? (string) $invoice->amount
                    : $this->fx->convertToUsd((string) $invoice->amount, $invoice->currency);

                $this->payments->recordPayment(RecordPaymentInputData::from([
                    'invoice_id' => $invoice->id,
                    'amount' => $amountUsd,
                    'payment_method' => 'zimswitch',
                    'status' => PaymentStatus::Succeeded,
                    'transaction_reference' => $checkoutId,
                    'paid_currency' => strtoupper($invoice->currency),
                    'paid_amount' => (string) $invoice->amount,
                ]));
            }
        }

        $session->provider_checkout_id = $checkoutId;
        $session->status = $interpreted['success'] ? 'processing' : ($interpreted['pending'] ? 'processing' : 'failed');
        $session->metadata = array_merge((array) ($session->metadata ?? []), [
            'zimswitch' => array_merge((array) data_get($session->metadata, 'zimswitch', []), [
                'status' => [
                    'payment_status' => (string) ($interpreted['payment_status'] ?? 'failed'),
                    'category' => (string) ($interpreted['category'] ?? 'unknown'),
                    'result_code' => $interpreted['result_code'] ?? null,
                    'message' => (string) ($interpreted['message'] ?? ''),
                    'description' => $interpreted['description'] ?? null,
                    'gateway_description' => $interpreted['gateway_description'] ?? null,
                    'extended_description' => $interpreted['extended_description'] ?? null,
                ],
            ]),
        ]);
        $session->save();

        Log::channel('zimswitch')->info('ZimSwitch: payment status interpreted (hosted return)', [
            'checkout_session_public_id' => $session->public_id,
            'invoice_id' => $session->invoice_id,
            'checkout_id' => $checkoutId,
            'result_code' => $interpreted['result_code'] ?? null,
            'payment_status' => $interpreted['payment_status'] ?? null,
            'category' => $interpreted['category'] ?? null,
            'requires_review' => $interpreted['requires_review'] ?? null,
        ]);

        return redirect()->route('public.checkout.complete', ['publicId' => $session->public_id]);
    }

    public function complete(string $publicId): RedirectResponse|Response
    {
        /** @var CheckoutSession $session */
        $session = CheckoutSession::withoutGlobalScopes()
            ->where('public_id', $publicId)
            ->firstOrFail();

        request()->attributes->set('tenant_id', $session->team_id);

        $session->refresh();

        $callbackUrl = null;
        if (is_string($session->callback_url) && $session->callback_url !== '' && $session->status === 'succeeded' && $session->subscription_id !== null) {
            $sep = str_contains($session->callback_url, '?') ? '&' : '?';
            $callbackUrl = $session->callback_url.$sep.http_build_query([
                'checkout_session_id' => $session->public_id,
                'status' => $session->status,
                'subscription_id' => $session->subscription_id,
            ]);
        }

        $session->loadMissing(['plan.product', 'invoice']);

        return Inertia::render('public-checkout/Complete', [
            'session' => [
                'public_id' => $session->public_id,
                'status' => $session->status,
                'payment_platform' => $session->payment_platform,
                'metadata' => $session->metadata,
            ],
            'plan' => [
                'name' => $session->plan->name,
                'product_name' => $session->plan->product?->name,
            ],
            'invoice' => [
                'amount' => (string) $session->invoice->amount,
                'currency' => strtoupper((string) $session->invoice->currency),
                'status' => $session->invoice->status->value,
            ],
            'urls' => [
                'back_to_checkout' => route('public.checkout.show', ['publicId' => $session->public_id]),
                'callback_url' => $callbackUrl,
            ],
        ]);
    }

    public function omariForm(string $publicId): Response
    {
        /** @var CheckoutSession $session */
        $session = CheckoutSession::withoutGlobalScopes()
            ->where('public_id', $publicId)
            ->firstOrFail();

        request()->attributes->set('tenant_id', $session->team_id);
        $session->loadMissing(['plan.product', 'invoice']);

        return Inertia::render('public-checkout/Omari', [
            'session' => [
                'public_id' => $session->public_id,
                'status' => $session->status,
            ],
            'plan' => [
                'name' => $session->plan->name,
                'product_name' => $session->plan->product?->name,
            ],
            'invoice' => [
                'amount' => (string) $session->invoice->amount,
                'currency' => strtoupper((string) $session->invoice->currency),
            ],
            'urls' => [
                'auth' => route('public.checkout.omari.auth', ['publicId' => $session->public_id]),
                'back' => route('public.checkout.show', ['publicId' => $session->public_id]),
            ],
        ]);
    }

    public function startOmariAuth(Request $request, string $publicId): Response
    {
        /** @var CheckoutSession $session */
        $session = CheckoutSession::withoutGlobalScopes()
            ->where('public_id', $publicId)
            ->firstOrFail();

        request()->attributes->set('tenant_id', $session->team_id);

        $validated = $request->validate([
            'msisdn' => ['required', 'string', 'max:20'],
        ]);

        /** @var Invoice $invoice */
        $invoice = Invoice::withoutGlobalScopes()->findOrFail($session->invoice_id);

        $reference = sprintf('chk_%s_inv_%d', $session->public_id, $invoice->id);
        try {
            $auth = $this->omari->authenticate([
                'msisdn' => $validated['msisdn'],
                'reference' => $reference,
                'amount' => (float) $invoice->amount,
                'currency' => strtoupper((string) $invoice->currency),
                'channel' => 'WEB',
            ]);
        } catch (\Throwable $e) {
            $this->exceptions->report($e, [
                'omari' => [
                    'checkout_public_id' => $session->public_id,
                    'invoice_id' => $invoice->id,
                ],
            ]);

            throw $e;
        }

        $session->payment_platform = 'omari';
        $session->provider_reference = $reference;
        $session->status = 'processing';
        $session->save();

        return Inertia::render('public-checkout/Omari', [
            'session' => [
                'public_id' => $session->public_id,
                'status' => $session->status,
            ],
            'plan' => [
                'name' => $session->plan?->name,
                'product_name' => $session->plan?->product?->name,
            ],
            'invoice' => [
                'amount' => (string) $invoice->amount,
                'currency' => strtoupper((string) $invoice->currency),
            ],
            'omari' => [
                'msisdn' => $validated['msisdn'],
                'otp_reference' => $auth['otpReference'] ?? null,
            ],
            'urls' => [
                'confirm' => route('public.checkout.omari.confirm', ['publicId' => $session->public_id]),
                'back' => route('public.checkout.show', ['publicId' => $session->public_id]),
            ],
        ]);
    }

    public function confirmOmariOtp(Request $request, string $publicId): RedirectResponse
    {
        /** @var CheckoutSession $session */
        $session = CheckoutSession::withoutGlobalScopes()
            ->where('public_id', $publicId)
            ->firstOrFail();

        request()->attributes->set('tenant_id', $session->team_id);

        $validated = $request->validate([
            'msisdn' => ['required', 'string', 'max:20'],
            'otp' => ['required', 'string', 'max:10'],
        ]);

        $reference = (string) ($session->provider_reference ?? '');
        if ($reference === '') {
            throw new RuntimeException('Omari reference missing for this checkout session.');
        }

        $resp = $this->omari->submitRequest([
            'msisdn' => $validated['msisdn'],
            'reference' => $reference,
            'otp' => $validated['otp'],
        ]);

        $code = is_string($resp['responseCode'] ?? null) ? (string) $resp['responseCode'] : null;
        $approved = $code === null || $code === '000';

        if ($approved) {
            /** @var Invoice $invoice */
            $invoice = Invoice::withoutGlobalScopes()->findOrFail($session->invoice_id);

            $txnRef = (string) ($resp['paymentReference'] ?? $reference);
            $already = Payment::withoutGlobalScopes()
                ->where('invoice_id', $invoice->id)
                ->where('transaction_reference', $txnRef)
                ->exists();

            if (! $already) {
                $amountUsd = strtoupper($invoice->currency) === ExchangeRateService::BASE
                    ? (string) $invoice->amount
                    : $this->fx->convertToUsd((string) $invoice->amount, $invoice->currency);

                $this->payments->recordPayment(RecordPaymentInputData::from([
                    'invoice_id' => $invoice->id,
                    'amount' => $amountUsd,
                    'payment_method' => 'omari',
                    'status' => PaymentStatus::Succeeded,
                    'transaction_reference' => $txnRef,
                    'paid_currency' => strtoupper($invoice->currency),
                    'paid_amount' => (string) $invoice->amount,
                ]));
            }

            $session->provider_checkout_id = (string) ($resp['debitReference'] ?? '');
            $session->status = 'processing';
        } else {
            $session->status = 'failed';
        }

        $session->save();

        return redirect()->route('public.checkout.complete', ['publicId' => $session->public_id]);
    }
}
