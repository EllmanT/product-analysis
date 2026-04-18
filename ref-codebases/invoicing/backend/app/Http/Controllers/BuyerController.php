<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesTenantCompany;
use App\Http\Requests\StoreBuyerRequest;
use App\Http\Requests\UpdateBuyerRequest;
use App\Models\Buyer;
use App\Repositories\Interfaces\BuyerRepositoryInterface;

class BuyerController extends Controller
{
    use ResolvesTenantCompany;

    public function __construct(
        protected BuyerRepositoryInterface $repository
    ) {}

    /**
     * Buyers for the authenticated tenant company only.
     */
    public function index()
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        return response()->json(
            Buyer::query()->where('company_id', $company->id)->orderBy('trade_name')->orderBy('register_name')->get()
        );
    }

    public function show(string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = Buyer::query()->where('company_id', $company->id)->where('id', $id)->first();
        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return response()->json($model);
    }

    public function store(StoreBuyerRequest $request)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $data = array_merge($request->validated(), ['company_id' => $company->id]);
        $model = $this->repository->create($data);

        return response()->json($model, 201);
    }

    public function update(UpdateBuyerRequest $request, string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = Buyer::query()->where('company_id', $company->id)->where('id', $id)->first();
        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $model->update($request->validated());

        return response()->json($model->fresh());
    }

    public function destroy(string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = Buyer::query()->where('company_id', $company->id)->where('id', $id)->first();
        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $model->delete();

        return response()->json(null, 204);
    }
}
