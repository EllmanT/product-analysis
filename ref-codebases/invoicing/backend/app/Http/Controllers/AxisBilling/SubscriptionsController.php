<?php

declare(strict_types=1);

namespace App\Http\Controllers\AxisBilling;

use App\Exceptions\AxisBillingException;
use App\Models\Company;
use App\Models\ExternalSubscription;
use App\Models\User;
use App\Services\AxisBillingClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class SubscriptionsController
{
    public function __construct(private readonly AxisBillingClient $client) {}

    public function index(): JsonResponse
    {
        try {
            return response()->json($this->client->listSubscriptions());
        } catch (AxisBillingException $e) {
            return response()->json(['message' => $e->getMessage()], $e->httpStatus());
        }
    }

    public function show(string $subscription): JsonResponse
    {
        try {
            return response()->json($this->client->getSubscription($subscription));
        } catch (AxisBillingException $e) {
            return response()->json(['message' => $e->getMessage()], $e->httpStatus());
        }
    }

    public function store(Request $request): JsonResponse
    {
        $payload = $this->validatedPayload($request);

        try {
            $result = $this->client->createSubscription($payload);

            $this->persistAxisCustomerIdFromResult($request, $result);
            $this->persistExternalSubscriptionFromResult($result);

            return response()->json($result, 201);
        } catch (AxisBillingException $e) {
            return response()->json(['message' => $e->getMessage()], $e->httpStatus());
        }
    }

    public function update(Request $request, string $subscription): JsonResponse
    {
        $payload = $this->validatedPayload($request);

        try {
            return response()->json($this->client->updateSubscription($subscription, $payload));
        } catch (AxisBillingException $e) {
            return response()->json(['message' => $e->getMessage()], $e->httpStatus());
        }
    }

    public function destroy(string $subscription): JsonResponse
    {
        try {
            return response()->json($this->client->deleteSubscription($subscription));
        } catch (AxisBillingException $e) {
            return response()->json(['message' => $e->getMessage()], $e->httpStatus());
        }
    }

    public function byCustomer(string $customer): JsonResponse
    {
        try {
            $result = $this->client->subscriptionsByCustomer($customer);
            $this->persistExternalSubscriptionsFromListResult($result);

            return response()->json($result);
        } catch (AxisBillingException $e) {
            return response()->json(['message' => $e->getMessage()], $e->httpStatus());
        }
    }

    public function activate(Request $request, string $subscription): JsonResponse
    {
        try {
            $result = $this->client->activateSubscription($subscription);

            $this->persistAxisCustomerIdFromResult($request, $result);
            $this->persistExternalSubscriptionFromResult($result);

            // Some Axis Billing installations return a minimal payload for "activate".
            // Fetch the subscription details to reliably persist customer/status/plan.
            try {
                $details = $this->client->getSubscription($subscription);
                $this->persistAxisCustomerIdFromResult($request, $details);
                $this->persistExternalSubscriptionFromResult($details);
            } catch (AxisBillingException) {
                // If the follow-up fetch fails, we still return the activate result.
            }

            return response()->json($result);
        } catch (AxisBillingException $e) {
            return response()->json(['message' => $e->getMessage()], $e->httpStatus());
        }
    }

    public function cancel(Request $request, string $subscription): JsonResponse
    {
        try {
            return response()->json($this->client->cancelSubscription($subscription, $this->validatedPayload($request)));
        } catch (AxisBillingException $e) {
            return response()->json(['message' => $e->getMessage()], $e->httpStatus());
        }
    }

    public function renew(Request $request, string $subscription): JsonResponse
    {
        try {
            return response()->json($this->client->renewSubscription($subscription, $this->validatedPayload($request)));
        } catch (AxisBillingException $e) {
            return response()->json(['message' => $e->getMessage()], $e->httpStatus());
        }
    }

    public function transitionStatus(Request $request, string $subscription): JsonResponse
    {
        try {
            return response()->json($this->client->transitionSubscriptionStatus($subscription, $this->validatedPayload($request)));
        } catch (AxisBillingException $e) {
            return response()->json(['message' => $e->getMessage()], $e->httpStatus());
        }
    }

    /** @return array<string, mixed> */
    private function validatedPayload(Request $request): array
    {
        $payload = $request->json()->all();

        return is_array($payload) ? $payload : [];
    }

    /** @param array<string, mixed> $result */
    private function persistAxisCustomerIdFromResult(Request $request, array $result): void
    {
        $user = $request->user();
        if (! $user instanceof User) {
            return;
        }

        $companyId = $user->company_id;
        if (! is_string($companyId) || $companyId === '') {
            return;
        }

        $customerId = $result['customer_id']
            ?? ($result['customer']['id'] ?? null)
            ?? ($result['data']['customer_id'] ?? null)
            ?? ($result['data']['customer']['id'] ?? null);
        if (! is_int($customerId) && ! (is_string($customerId) && is_numeric($customerId))) {
            return;
        }

        $customerId = (int) $customerId;

        Company::query()
            ->where('id', $companyId)
            ->whereNull('axis_billing_customer_id')
            ->update(['axis_billing_customer_id' => $customerId]);
    }

    /** @param array<string, mixed> $result */
    private function persistExternalSubscriptionFromResult(array $result): void
    {
        $subscriptionId = $result['subscription_id']
            ?? ($result['id'] ?? null)
            ?? ($result['data']['subscription_id'] ?? null)
            ?? ($result['data']['id'] ?? null);
        if (! is_string($subscriptionId) && ! is_int($subscriptionId)) {
            return;
        }
        $subscriptionId = (string) $subscriptionId;
        if (trim($subscriptionId) === '') {
            return;
        }

        $status = $result['status']
            ?? ($result['data']['status'] ?? null)
            ?? '';
        if (! is_string($status)) {
            $status = (string) $status;
        }
        $status = strtolower(trim($status));
        if ($status === '') {
            return;
        }

        $teamId = $result['team_id']
            ?? ($result['data']['team_id'] ?? null)
            ?? null;
        $customerId = $result['customer_id']
            ?? ($result['customer']['id'] ?? null)
            ?? ($result['data']['customer_id'] ?? null)
            ?? ($result['data']['customer']['id'] ?? null)
            ?? null;
        $planId = $result['plan_id']
            ?? ($result['plan']['id'] ?? null)
            ?? ($result['data']['plan_id'] ?? null)
            ?? ($result['data']['plan']['id'] ?? null)
            ?? null;

        ExternalSubscription::updateOrCreate(
            ['axis_subscription_id' => $subscriptionId],
            [
                'team_id' => is_numeric($teamId) ? (int) $teamId : null,
                'customer_id' => is_numeric($customerId) ? (int) $customerId : null,
                'plan_id' => is_numeric($planId) ? (int) $planId : null,
                'status' => $status,
            ],
        );
    }

    /** @param array<string, mixed> $result */
    private function persistExternalSubscriptionsFromListResult(array $result): void
    {
        $items = null;

        if (array_is_list($result)) {
            $items = $result;
        } elseif (isset($result['data']) && is_array($result['data'])) {
            $items = $result['data'];
        } elseif (isset($result['subscriptions']) && is_array($result['subscriptions'])) {
            $items = $result['subscriptions'];
        } elseif (isset($result['items']) && is_array($result['items'])) {
            $items = $result['items'];
        }

        if (! is_array($items)) {
            return;
        }

        foreach ($items as $row) {
            if (! is_array($row)) {
                continue;
            }
            /** @var array<string, mixed> $row */
            $this->persistExternalSubscriptionFromResult($row);
        }
    }
}

