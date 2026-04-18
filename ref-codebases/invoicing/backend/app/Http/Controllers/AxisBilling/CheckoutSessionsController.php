<?php

declare(strict_types=1);

namespace App\Http\Controllers\AxisBilling;

use App\Exceptions\AxisBillingException;
use App\Models\User;
use App\Services\AxisBillingClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class CheckoutSessionsController
{
    public function __construct(private readonly AxisBillingClient $client) {}

    public function store(Request $request): JsonResponse
    {
        $planId = $request->integer('plan_id');
        if ($planId <= 0) {
            return response()->json(['message' => 'plan_id is required.'], 422);
        }

        $callbackUrl = $request->string('callback_url')->toString();
        if (trim($callbackUrl) === '') {
            $callbackUrl = rtrim((string) config('app.url'), '/').'/billing';
        }

        $externalReference = $request->string('external_reference')->toString();
        $customerId = $request->integer('customer_id');
        $customer = $request->input('customer');
        $metadata = $request->input('metadata');

        $user = $request->user();
        if ($user instanceof User) {
            if (trim($externalReference) === '') {
                $externalReference = 'company:'.($user->company_id ?? '').' user:'.($user->id ?? '');
            }

            if (! is_array($metadata)) {
                $metadata = [];
            }

            $metadata = array_merge($metadata, array_filter([
                'company_id' => $user->company_id,
                'user_id' => $user->id,
                'source' => 'e-invoicing',
            ], static fn ($v) => $v !== null && $v !== ''));
        }

        /** @var array<string, mixed> $payload */
        $payload = array_filter([
            'plan_id' => $planId,
            'callback_url' => $callbackUrl,
            'external_reference' => trim($externalReference) !== '' ? $externalReference : null,
            'customer_id' => $customerId > 0 ? $customerId : null,
            'customer' => is_array($customer) ? $customer : null,
            'metadata' => is_array($metadata) ? $metadata : null,
        ], static fn ($v) => $v !== null);

        try {
            return response()->json($this->client->createCheckoutSession($payload), 201);
        } catch (AxisBillingException $e) {
            return response()->json(['message' => $e->getMessage()], $e->httpStatus());
        }
    }
}

