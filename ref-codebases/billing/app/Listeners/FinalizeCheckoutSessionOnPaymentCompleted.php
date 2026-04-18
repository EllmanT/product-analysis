<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Events\PaymentCompleted;
use App\Models\CheckoutSession;
use App\Models\Invoice;
use App\Services\CheckoutSessionService;
use Illuminate\Support\Facades\Log;

final class FinalizeCheckoutSessionOnPaymentCompleted
{
    public function __construct(
        private readonly CheckoutSessionService $sessions,
    ) {}

    public function handle(PaymentCompleted $event): void
    {
        /** @var Invoice $invoice */
        $invoice = $event->invoice->refresh();

        if ($invoice->checkout_session_id === null) {
            return;
        }

        /** @var CheckoutSession|null $session */
        $session = CheckoutSession::withoutGlobalScopes()->find($invoice->checkout_session_id);
        if ($session === null) {
            return;
        }

        if ($session->status === 'succeeded') {
            return;
        }

        // Set tenant context for any scoped work
        request()->attributes->set('tenant_id', $session->team_id);

        $session->payment_platform = $event->payment->payment_method;
        $session->payment_id = $event->payment->id;
        $session->status = 'succeeded';
        $session->completed_at = now();
        $session->save();

        $sub = $this->sessions->ensureSubscriptionForSucceededSession($session);

        $channel = match ((string) $event->payment->payment_method) {
            'ecocash' => 'ecocash',
            'zimswitch' => 'zimswitch',
            'omari' => 'omari',
            default => 'payments',
        };

        Log::channel($channel)->info('Checkout session finalized', [
            'checkout_session_id' => $session->id,
            'public_id' => $session->public_id,
            'invoice_id' => $invoice->id,
            'payment_id' => $event->payment->id,
            'subscription_id' => $sub?->id,
        ]);
    }
}
