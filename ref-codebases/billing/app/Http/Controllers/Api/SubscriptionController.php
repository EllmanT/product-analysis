<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Data\Api\UpdateSubscriptionData;
use App\Data\CancelSubscriptionInputData;
use App\Data\CreateSubscriptionInputData;
use App\Data\RenewSubscriptionInputData;
use App\Data\TransitionSubscriptionStatusInputData;
use App\Exceptions\InvalidSubscriptionTransitionException;
use App\Http\Api\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Subscription;
use App\Services\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class SubscriptionController extends Controller
{
    public function __construct(
        private readonly SubscriptionService $subscriptionService,
    ) {}

    public function index(): JsonResponse
    {
        return ApiResponse::ok($this->subscriptionService->listSubscriptions());
    }

    /**
     * Get subscriptions by customer
     */
    public function byCustomer(Customer $customer): JsonResponse
    {
        return ApiResponse::ok($this->subscriptionService->getByCustomer($customer->id));
    }

    /**
     * Get a single subscription
     */
    public function show(Subscription $subscription): JsonResponse
    {
        return ApiResponse::ok($this->subscriptionService->getSubscription($subscription));
    }

    /**
     * Create a new subscription
     */
    public function store(Request $request): JsonResponse
    {
        $data = CreateSubscriptionInputData::fromRequest($request);

        return ApiResponse::created($this->subscriptionService->create($data));
    }

    /**
     * Activate a subscription
     */
    public function activate(Subscription $subscription): JsonResponse
    {
        try {
            return ApiResponse::ok($this->subscriptionService->activate($subscription));
        } catch (InvalidSubscriptionTransitionException $e) {
            return ApiResponse::error($e->getMessage(), 422);
        }
    }

    /**
     * Cancel a subscription
     */
    public function cancel(Request $request, Subscription $subscription): JsonResponse
    {
        $data = CancelSubscriptionInputData::fromRequest($request);

        try {
            return ApiResponse::ok($this->subscriptionService->cancel($subscription, $data));
        } catch (InvalidSubscriptionTransitionException $e) {
            return ApiResponse::error($e->getMessage(), 422);
        }
    }

    /**
     * Renew a subscription
     */
    public function renew(Request $request, Subscription $subscription): JsonResponse
    {
        $data = RenewSubscriptionInputData::fromRequest($request);

        try {
            return ApiResponse::ok($this->subscriptionService->renew($subscription, $data));
        } catch (InvalidSubscriptionTransitionException $e) {
            return ApiResponse::error($e->getMessage(), 422);
        }
    }

    /**
     * Transition subscription to a new status
     */
    public function transitionStatus(Request $request, Subscription $subscription): JsonResponse
    {
        $data = TransitionSubscriptionStatusInputData::fromRequest($request);

        try {
            return ApiResponse::ok(
                $this->subscriptionService->transitionStatus($subscription, $data)
            );
        } catch (InvalidSubscriptionTransitionException $e) {
            return ApiResponse::error($e->getMessage(), 422);
        }
    }

    /**
     * Update a subscription
     */
    public function update(Request $request, Subscription $subscription): JsonResponse
    {
        $data = UpdateSubscriptionData::fromRequest($request);

        return ApiResponse::ok($this->subscriptionService->updateSubscription($subscription, $data));
    }

    /**
     * Delete a subscription
     */
    public function destroy(Subscription $subscription): JsonResponse
    {
        $this->subscriptionService->deleteSubscription($subscription);

        return ApiResponse::noContent();
    }
}
