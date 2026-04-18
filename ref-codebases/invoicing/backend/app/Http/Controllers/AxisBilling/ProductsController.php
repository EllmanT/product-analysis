<?php

declare(strict_types=1);

namespace App\Http\Controllers\AxisBilling;

use App\Exceptions\AxisBillingException;
use App\Services\AxisBillingClient;
use Illuminate\Http\JsonResponse;

final class ProductsController
{
    public function __construct(private readonly AxisBillingClient $client) {}

    public function index(): JsonResponse
    {
        try {
            return response()->json($this->client->listProducts());
        } catch (AxisBillingException $e) {
            return response()->json(['message' => $e->getMessage()], $e->httpStatus());
        }
    }

    public function show(string $product): JsonResponse
    {
        try {
            return response()->json($this->client->getProduct($product));
        } catch (AxisBillingException $e) {
            return response()->json(['message' => $e->getMessage()], $e->httpStatus());
        }
    }
}

