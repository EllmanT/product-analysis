<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesTenantCompany;
use App\Http\Requests\StoreBankingDetailRequest;
use App\Http\Requests\UpdateBankingDetailRequest;
use App\Models\BankingDetail;
use App\Repositories\Interfaces\BankingDetailRepositoryInterface;

class BankingDetailController extends Controller
{
    use ResolvesTenantCompany;

    public function __construct(
        protected BankingDetailRepositoryInterface $repository
    ) {}

    public function index()
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        return response()->json(
            BankingDetail::query()->where('company_id', $company->id)->orderBy('sort_order')->get()
        );
    }

    public function show(string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = BankingDetail::query()->where('company_id', $company->id)->where('id', $id)->first();
        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return response()->json($model);
    }

    public function store(StoreBankingDetailRequest $request)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $data = array_merge($request->validated(), ['company_id' => $company->id]);
        $model = $this->repository->create($data);

        return response()->json($model, 201);
    }

    public function update(UpdateBankingDetailRequest $request, string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = BankingDetail::query()->where('company_id', $company->id)->where('id', $id)->first();
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

        $model = BankingDetail::query()->where('company_id', $company->id)->where('id', $id)->first();
        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $model->delete();

        return response()->json(null, 204);
    }
}
