<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Events\InvoiceGenerated;
use App\Events\PaymentCompleted;
use App\Events\SubscriptionCanceled;
use App\Events\SubscriptionCreated;
use Illuminate\Support\Facades\Log;

final class LogBillingEvents
{
    public function __invoke(object $event): void
    {
        match (true) {
            $event instanceof SubscriptionCreated => Log::info('billing.subscription_created', [
                'subscription_id' => $event->subscription->id,
                'team_id' => $event->subscription->team_id,
                'customer_id' => $event->subscription->customer_id,
                'plan_id' => $event->subscription->plan_id,
                'status' => $event->subscription->status->value,
            ]),
            $event instanceof SubscriptionCanceled => Log::info('billing.subscription_canceled', [
                'subscription_id' => $event->subscription->id,
                'team_id' => $event->subscription->team_id,
                'customer_id' => $event->subscription->customer_id,
                'status' => $event->subscription->status->value,
            ]),
            $event instanceof InvoiceGenerated => Log::info('billing.invoice_generated', [
                'invoice_id' => $event->invoice->id,
                'team_id' => $event->invoice->team_id,
                'customer_id' => $event->invoice->customer_id,
                'subscription_id' => $event->invoice->subscription_id,
                'source' => $event->source->value,
                'amount' => (string) $event->invoice->amount,
                'currency' => $event->invoice->currency,
            ]),
            $event instanceof PaymentCompleted => Log::info('billing.payment_completed', [
                'payment_id' => $event->payment->id,
                'invoice_id' => $event->invoice->id,
                'team_id' => $event->invoice->team_id,
                'amount' => (string) $event->payment->amount,
                'status' => $event->payment->status->value,
            ]),
            default => null,
        };
    }
}
