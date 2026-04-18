<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesTenantCompany;
use App\Http\Requests\StoreFiscalDayLogRequest;
use App\Http\Requests\UpdateFiscalDayLogRequest;
use App\Models\CompanyDevice;
use App\Models\FiscalDayLog;
use App\Repositories\Interfaces\FiscalDayLogRepositoryInterface;

class FiscalDayLogController extends Controller
{
    use ResolvesTenantCompany;

    public function __construct(
        protected FiscalDayLogRepositoryInterface $repository
    ) {}

    public function index()
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        return response()->json(
            FiscalDayLog::query()
                ->whereHas('device', fn ($q) => $q->where('company_id', $company->id))
                ->with('device')
                ->orderByDesc('created_at')
                ->get()
        );
    }

    public function show(string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = FiscalDayLog::query()
            ->whereHas('device', fn ($q) => $q->where('company_id', $company->id))
            ->where('id', $id)
            ->first();

        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return response()->json($model);
    }

    public function store(StoreFiscalDayLogRequest $request)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $data = $request->validated();
        $deviceOk = CompanyDevice::query()
            ->where('company_id', $company->id)
            ->where('id', $data['device_id'])
            ->exists();
        if (! $deviceOk) {
            return response()->json(['message' => 'Device does not belong to your company.'], 422);
        }

        $model = $this->repository->create($data);

        return response()->json($model, 201);
    }

    public function update(UpdateFiscalDayLogRequest $request, string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = FiscalDayLog::query()
            ->whereHas('device', fn ($q) => $q->where('company_id', $company->id))
            ->where('id', $id)
            ->first();

        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $data = $request->validated();
        if (isset($data['device_id'])) {
            $deviceOk = CompanyDevice::query()
                ->where('company_id', $company->id)
                ->where('id', $data['device_id'])
                ->exists();
            if (! $deviceOk) {
                return response()->json(['message' => 'Device does not belong to your company.'], 422);
            }
        }

        $model->update($data);

        return response()->json($model->fresh());
    }

    public function destroy(string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = FiscalDayLog::query()
            ->whereHas('device', fn ($q) => $q->where('company_id', $company->id))
            ->where('id', $id)
            ->first();

        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $model->delete();

        return response()->json(null, 204);
    }
}
