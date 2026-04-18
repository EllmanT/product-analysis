<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesTenantCompany;
use App\Http\Requests\StoreProductRequest;
use App\Http\Requests\UpdateProductRequest;
use App\Models\Product;
use App\Models\TaxRate;
use App\Repositories\Interfaces\ProductRepositoryInterface;
use App\Services\UnitOfMeasureService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    use ResolvesTenantCompany;

    public function __construct(
        protected ProductRepositoryInterface $repository,
        protected UnitOfMeasureService $unitOfMeasureService
    ) {}

    /**
     * Paginated list of products for the authenticated tenant company.
     */
    public function index(Request $request): JsonResponse
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $query = Product::query()->where('company_id', $company->id);

        if ($request->filled('search')) {
            $search = $request->string('search')->trim();
            $query->where(function ($q) use ($search): void {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhere('hs_code', 'like', "%{$search}%");
            });
        }

        if ($request->query->has('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        $perPage = min(max((int) $request->get('per_page', 15), 1), 100);

        return response()->json(
            $query->orderBy('name')->paginate($perPage)
        );
    }

    /**
     * Get a single product scoped to the tenant company.
     */
    public function show(string|int $id): JsonResponse
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = Product::query()
            ->where('company_id', $company->id)
            ->where('id', $id)
            ->first();

        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return response()->json($model);
    }

    /**
     * Create a new product for the tenant company.
     */
    public function store(StoreProductRequest $request): JsonResponse
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $data = array_merge($request->validated(), ['company_id' => $company->id]);
        $data = $this->applyTaxPercentFromRate($data);
        $model = $this->repository->create($data);
        $this->unitOfMeasureService->ensureUnitExists($company, $data['unit_of_measure'] ?? null);

        return response()->json($model, 201);
    }

    /**
     * Update a product belonging to the tenant company.
     */
    public function update(UpdateProductRequest $request, string|int $id): JsonResponse
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = Product::query()
            ->where('company_id', $company->id)
            ->where('id', $id)
            ->first();

        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $data = $this->applyTaxPercentFromRate($request->validated());
        $model->update($data);
        $this->unitOfMeasureService->ensureUnitExists($company, $data['unit_of_measure'] ?? $model->unit_of_measure);

        return response()->json($model->fresh());
    }

    /**
     * Delete a product belonging to the tenant company.
     */
    public function destroy(string|int $id): JsonResponse
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = Product::query()
            ->where('company_id', $company->id)
            ->where('id', $id)
            ->first();

        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $model->delete();

        return response()->json(null, 204);
    }

    /** @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function applyTaxPercentFromRate(array $data): array
    {
        if (! isset($data['tax_code'])) {
            return $data;
        }

        $rate = TaxRate::query()->where('code', $data['tax_code'])->first();
        if ($rate !== null) {
            $data['tax_percent'] = (float) $rate->percent;
        }

        return $data;
    }
}
