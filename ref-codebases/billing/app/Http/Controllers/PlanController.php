<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Data\Api\StorePlanData;
use App\Data\Api\UpdatePlanData;
use App\Data\ProductDto;
use App\Models\Plan;
use App\Models\Product;
use App\Repositories\Interfaces\ProductRepositoryInterface;
use App\Services\BillingIntervalConfigService;
use App\Services\PlanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class PlanController extends Controller
{
    public function __construct(
        private readonly PlanService $planService,
        private readonly ProductRepositoryInterface $productRepository,
        private readonly BillingIntervalConfigService $billingIntervalConfigService,
    ) {}

    public function index(Request $request): Response
    {
        $paginated = $this->planService->paginatedForIndex($request);

        $products = $this->productRepository->all()->map(
            fn (Product $product) => ProductDto::from($product)->toArray()
        )->values();

        $billingIntervals = $this->billingIntervalConfigService->ordered()
            ->map(fn ($c) => [
                'value' => $c->value,
                'label' => $c->label,
                'is_recurring' => $c->is_recurring,
            ])
            ->values();

        return Inertia::render('plans/Index', [
            'items' => $paginated['items'],
            'filters' => $paginated['filters'],
            'products' => $products,
            'billingIntervals' => $billingIntervals,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = StorePlanData::fromRequest($request);

        return response()->json([
            'data' => $this->planService->createPlan($data)->toArray(),
        ], 201);
    }

    public function update(Request $request, Plan $plan): JsonResponse
    {
        $data = UpdatePlanData::fromRequest($request);

        return response()->json([
            'data' => $this->planService->updatePlan($plan, $data)->toArray(),
        ]);
    }

    public function destroy(Plan $plan): JsonResponse
    {
        $this->planService->deletePlan($plan);

        return response()->json(null, 204);
    }
}
