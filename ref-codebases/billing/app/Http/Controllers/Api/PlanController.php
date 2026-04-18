<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Api\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Services\PlanService;
use Illuminate\Http\JsonResponse;

final class PlanController extends Controller
{
    public function __construct(
        private readonly PlanService $planService,
    ) {}

    /**
     * List all plans
     */
    public function index(): JsonResponse
    {
        return ApiResponse::ok($this->planService->listPlans());
    }

    /**
     * Get a single plan
     */
    public function show(Plan $plan): JsonResponse
    {
        return ApiResponse::ok($this->planService->getPlan($plan));
    }
}
