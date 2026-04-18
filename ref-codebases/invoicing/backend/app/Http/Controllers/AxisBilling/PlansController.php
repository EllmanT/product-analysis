<?php

declare(strict_types=1);

namespace App\Http\Controllers\AxisBilling;

use App\Exceptions\AxisBillingException;
use App\Services\AxisBillingClient;
use Illuminate\Http\JsonResponse;

final class PlansController
{
    public function __construct(private readonly AxisBillingClient $client) {}

    public function index(): JsonResponse
    {
        try {
            return response()->json($this->client->listPlans());
        } catch (AxisBillingException $e) {
            return response()->json(['message' => $e->getMessage()], $e->httpStatus());
        }
    }

    public function show(string $plan): JsonResponse
    {
        try {
            return response()->json($this->client->getPlan($plan));
        } catch (AxisBillingException $e) {
            return response()->json(['message' => $e->getMessage()], $e->httpStatus());
        }
    }
}

