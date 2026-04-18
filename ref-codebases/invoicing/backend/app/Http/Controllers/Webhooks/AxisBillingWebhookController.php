<?php

declare(strict_types=1);

namespace App\Http\Controllers\Webhooks;

use App\Models\AxisWebhookDelivery;
use App\Models\ExternalInvoice;
use App\Models\ExternalPayment;
use App\Models\ExternalSubscription;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class AxisBillingWebhookController
{
    public function __invoke(Request $request): Response
    {
        $raw = $request->getContent();

        if (! $this->signatureIsValid($raw, (string) $request->header('X-Axis-Signature', ''))) {
            return response()->noContent(401);
        }

        if ($this->alreadyProcessed($raw)) {
            return response()->noContent(200);
        }

        $payload = $this->decodeJson($raw);
        if ($payload === null) {
            return response()->noContent(200);
        }

        $type = (string) ($payload['type'] ?? '');
        $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];

        match ($type) {
            'subscription.created' => $this->handleSubscriptionCreated($data),
            'subscription.canceled' => $this->handleSubscriptionCanceled($data),
            'invoice.generated' => $this->handleInvoiceGenerated($data, $raw),
            'payment.completed' => $this->handlePaymentCompleted($data, $raw),
            default => null,
        };

        return response()->noContent(200);
    }

    private function signatureIsValid(string $raw, string $signatureHeader): bool
    {
        $secret = (string) config('services.axis_billing.webhook_secret');
        if ($secret === '') {
            return false;
        }

        if ($signatureHeader === '') {
            return false;
        }

        $expected = hash_hmac('sha256', $raw, $secret);

        return hash_equals($expected, $signatureHeader);
    }

    private function alreadyProcessed(string $raw): bool
    {
        $hash = hash('sha256', $raw);

        try {
            $delivery = AxisWebhookDelivery::firstOrCreate(
                ['payload_hash' => $hash],
                ['payload' => $raw],
            );
        } catch (QueryException) {
            return true;
        }

        return ! $delivery->wasRecentlyCreated;
    }

    /** @return array<string, mixed>|null */
    private function decodeJson(string $raw): ?array
    {
        try {
            $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }

        return is_array($decoded) ? $decoded : null;
    }

    /** @param array<string, mixed> $data */
    private function handleSubscriptionCreated(array $data): void
    {
        $subscriptionId = (string) ($data['subscription_id'] ?? '');
        if ($subscriptionId === '') {
            return;
        }

        ExternalSubscription::updateOrCreate(
            ['axis_subscription_id' => $subscriptionId],
            [
                'team_id' => $this->nullableInt($data['team_id'] ?? null),
                'customer_id' => $this->nullableInt($data['customer_id'] ?? null),
                'plan_id' => $this->nullableInt($data['plan_id'] ?? null),
                'status' => (string) ($data['status'] ?? ''),
            ],
        );
    }

    /** @param array<string, mixed> $data */
    private function handleSubscriptionCanceled(array $data): void
    {
        $subscriptionId = (string) ($data['subscription_id'] ?? '');
        if ($subscriptionId === '') {
            return;
        }

        ExternalSubscription::where('axis_subscription_id', $subscriptionId)
            ->update([
                'status' => (string) ($data['status'] ?? 'canceled'),
            ]);
    }

    /** @param array<string, mixed> $data */
    private function handleInvoiceGenerated(array $data, string $rawPayload): void
    {
        $invoiceId = (string) ($data['invoice_id'] ?? '');
        if ($invoiceId === '') {
            return;
        }

        ExternalInvoice::updateOrCreate(
            ['axis_invoice_id' => $invoiceId],
            [
                'axis_subscription_id' => $this->nullableString($data['subscription_id'] ?? $data['axis_subscription_id'] ?? null),
                'customer_id' => $this->nullableInt($data['customer_id'] ?? null),
                'status' => $this->nullableString($data['status'] ?? null),
                'currency' => $this->nullableString($data['currency'] ?? null),
                'amount' => $this->nullableDecimal($data['amount'] ?? $data['total'] ?? null),
                'issued_at' => $this->nullableDateTimeString($data['issued_at'] ?? $data['generated_at'] ?? null),
                'payload' => $rawPayload,
            ],
        );
    }

    /** @param array<string, mixed> $data */
    private function handlePaymentCompleted(array $data, string $rawPayload): void
    {
        $paymentId = (string) ($data['payment_id'] ?? '');
        if ($paymentId === '') {
            return;
        }

        ExternalPayment::updateOrCreate(
            ['axis_payment_id' => $paymentId],
            [
                'axis_invoice_id' => $this->nullableString($data['invoice_id'] ?? null),
                'customer_id' => $this->nullableInt($data['customer_id'] ?? null),
                'status' => $this->nullableString($data['status'] ?? null),
                'currency' => $this->nullableString($data['currency'] ?? null),
                'amount' => $this->nullableDecimal($data['amount'] ?? null),
                'paid_at' => $this->nullableDateTimeString($data['paid_at'] ?? $data['completed_at'] ?? null),
                'payload' => $rawPayload,
            ],
        );
    }

    private function nullableInt(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_int($value)) {
            return $value;
        }

        if (is_string($value) && is_numeric($value)) {
            return (int) $value;
        }

        return null;
    }

    private function nullableString(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $v = trim($value);

        return $v === '' ? null : $v;
    }

    private function nullableDecimal(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }

        if (is_string($value) && is_numeric($value)) {
            return $value;
        }

        return null;
    }

    private function nullableDateTimeString(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $v = trim($value);

        return $v === '' ? null : $v;
    }
}

