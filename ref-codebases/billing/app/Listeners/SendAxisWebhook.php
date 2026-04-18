<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Events\InvoiceGenerated;
use App\Events\PaymentCompleted;
use App\Events\SubscriptionCanceled;
use App\Events\SubscriptionCreated;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Http;
use JsonException;
use Throwable;

final class SendAxisWebhook implements ShouldQueue
{
    use InteractsWithQueue;

    public function __invoke(object $event): void
    {
        $url = config('services.axis.webhook_url');
        if ($url === null || $url === '') {
            return;
        }

        $secret = (string) config('services.axis.webhook_secret', '');

        [$type, $data] = match (true) {
            $event instanceof SubscriptionCreated => [
                'subscription.created',
                [
                    'subscription_id' => $event->subscription->id,
                    'team_id' => $event->subscription->team_id,
                    'customer_id' => $event->subscription->customer_id,
                    'plan_id' => $event->subscription->plan_id,
                    'status' => $event->subscription->status->value,
                ],
            ],
            $event instanceof SubscriptionCanceled => [
                'subscription.canceled',
                [
                    'subscription_id' => $event->subscription->id,
                    'team_id' => $event->subscription->team_id,
                    'customer_id' => $event->subscription->customer_id,
                    'status' => $event->subscription->status->value,
                ],
            ],
            $event instanceof InvoiceGenerated => [
                'invoice.generated',
                [
                    'invoice_id' => $event->invoice->id,
                    'team_id' => $event->invoice->team_id,
                    'customer_id' => $event->invoice->customer_id,
                    'subscription_id' => $event->invoice->subscription_id,
                    'source' => $event->source->value,
                    'amount' => (string) $event->invoice->amount,
                    'currency' => $event->invoice->currency,
                ],
            ],
            $event instanceof PaymentCompleted => [
                'payment.completed',
                [
                    'payment_id' => $event->payment->id,
                    'invoice_id' => $event->invoice->id,
                    'team_id' => $event->invoice->team_id,
                    'amount' => (string) $event->payment->amount,
                    'status' => $event->payment->status->value,
                ],
            ],
            default => [null, []],
        };

        if ($type === null) {
            return;
        }

        $envelope = [
            'type' => $type,
            'occurred_at' => now()->toIso8601String(),
            'data' => $data,
        ];

        try {
            $body = json_encode($envelope, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return;
        }

        try {
            $response = Http::withHeaders([
                'X-Axis-Signature' => hash_hmac('sha256', $body, $secret),
                'Content-Type' => 'application/json',
            ])
                ->timeout((int) config('services.axis.webhook_timeout', 10))
                ->withBody($body, 'application/json')
                ->post($url);

            if ($response->failed()) {
                $this->release(60);
            }
        } catch (Throwable) {
            $this->release(60);
        }
    }
}
