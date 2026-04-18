<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesTenantCompany;
use App\Http\Requests\StoreUnitOfMeasureRequest;
use App\Http\Requests\UpdateUnitOfMeasureRequest;
use App\Models\UnitOfMeasure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UnitOfMeasureController extends Controller
{
    use ResolvesTenantCompany;

    public function index(Request $request): JsonResponse
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $perPage = min(max($request->integer('per_page', 100), 1), 500);
        $query = UnitOfMeasure::query()->where('company_id', $company->id)->orderBy('name');

        if ($request->filled('search')) {
            $s = $request->string('search')->trim();
            $query->where('name', 'like', '%'.$s.'%');
        }

        return response()->json($query->paginate($perPage));
    }

    public function store(StoreUnitOfMeasureRequest $request): JsonResponse
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $name = $request->validated('name');
        $model = UnitOfMeasure::query()->create([
            'company_id' => $company->id,
            'name' => $name,
        ]);

        return response()->json($model, 201);
    }

    public function update(UpdateUnitOfMeasureRequest $request, string $id): JsonResponse
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = UnitOfMeasure::query()
            ->where('company_id', $company->id)
            ->where('id', $id)
            ->first();

        if ($model === null) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $model->update($request->validated());

        return response()->json($model->fresh());
    }

    public function destroy(string $id): JsonResponse
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = UnitOfMeasure::query()
            ->where('company_id', $company->id)
            ->where('id', $id)
            ->first();

        if ($model === null) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $model->delete();

        return response()->json(null, 204);
    }
}
