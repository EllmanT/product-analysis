<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Events\InvoiceGenerated;
use App\Events\PaymentCompleted;
use App\Events\SubscriptionCanceled;
use App\Events\SubscriptionCreated;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Subscription;
use App\Models\User;
use App\Notifications\BillingNotification;
use Illuminate\Support\Facades\Notification;

final class NotifyTeamBillingEvents
{
    public function __invoke(object $event): void
    {
        $teamId = match (true) {
            $event instanceof SubscriptionCreated => $event->subscription->team_id,
            $event instanceof SubscriptionCanceled => $event->subscription->team_id,
            $event instanceof InvoiceGenerated => $event->invoice->team_id,
            $event instanceof PaymentCompleted => $event->invoice->team_id,
            default => null,
        };

        if ($teamId === null) {
            return;
        }

        $users = User::query()->where('team_id', $teamId)->get();
        if ($users->isEmpty()) {
            return;
        }

        [$title, $payload] = match (true) {
            $event instanceof SubscriptionCreated => [
                'Subscription created',
                $this->subscriptionPayload($event->subscription),
            ],
            $event instanceof SubscriptionCanceled => [
                'Subscription canceled',
                $this->subscriptionPayload($event->subscription),
            ],
            $event instanceof InvoiceGenerated => [
                'Invoice generated',
                $this->invoicePayload($event->invoice, $event->source->value),
            ],
            $event instanceof PaymentCompleted => [
                'Payment completed',
                $this->paymentPayload($event->payment, $event->invoice),
            ],
            default => [null, []],
        };

        if ($title === null) {
            return;
        }

        Notification::send($users, new BillingNotification($title, $payload));
    }

    /**
     * @return array<string, string|int|float|null>
     */
    private function subscriptionPayload(Subscription $subscription): array
    {
        return [
            'Subscription' => $subscription->id,
            'Customer' => $subscription->customer_id,
            'Plan' => $subscription->plan_id,
            'Status' => $subscription->status->value,
        ];
    }

    /**
     * @return array<string, string|int|float|null>
     */
    private function invoicePayload(Invoice $invoice, string $source): array
    {
        return [
            'Invoice' => $invoice->id,
            'Customer' => $invoice->customer_id,
            'Amount' => (string) $invoice->amount,
            'Currency' => $invoice->currency,
            'Source' => $source,
        ];
    }

    /**
     * @return array<string, string|int|float|null>
     */
    private function paymentPayload(Payment $payment, Invoice $invoice): array
    {
        return [
            'Payment' => $payment->id,
            'Invoice' => $invoice->id,
            'Amount' => (string) $payment->amount,
            'Status' => $payment->status->value,
        ];
    }
}
