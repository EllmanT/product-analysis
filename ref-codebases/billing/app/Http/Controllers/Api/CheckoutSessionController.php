<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Data\CreateCheckoutSessionInputData;
use App\Http\Api\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\CheckoutSession;
use App\Services\CheckoutSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class CheckoutSessionController extends Controller
{
    public function __construct(
        private readonly CheckoutSessionService $service,
    ) {}

    /**
     * Create a hosted checkout session (Stripe-like).
     *
     * External systems call this endpoint with their API key and then redirect the user
     * to the returned `url`.
     */
    public function store(Request $request): JsonResponse
    {
        $data = CreateCheckoutSessionInputData::fromRequest($request);

        $session = $this->service->create($data);

        return ApiResponse::created([
            'id' => $session->public_id,
            'status' => $session->status,
            'url' => route('public.checkout.show', ['publicId' => $session->public_id]),
        ]);
    }

    /**
     * Retrieve a checkout session (server-side status check).
     */
    public function show(CheckoutSession $checkoutSession): JsonResponse
    {
        return ApiResponse::ok([
            'id' => $checkoutSession->public_id,
            'status' => $checkoutSession->status,
            'plan_id' => $checkoutSession->plan_id,
            'customer_id' => $checkoutSession->customer_id,
            'invoice_id' => $checkoutSession->invoice_id,
            'subscription_id' => $checkoutSession->subscription_id,
            'payment_id' => $checkoutSession->payment_id,
            'payment_platform' => $checkoutSession->payment_platform,
            'provider_checkout_id' => $checkoutSession->provider_checkout_id,
            'provider_reference' => $checkoutSession->provider_reference,
            'completed_at' => $checkoutSession->completed_at?->toIso8601String(),
            'external_reference' => $checkoutSession->external_reference,
            'metadata' => $checkoutSession->metadata,
            'callback_url' => $checkoutSession->callback_url,
        ]);
    }
}
