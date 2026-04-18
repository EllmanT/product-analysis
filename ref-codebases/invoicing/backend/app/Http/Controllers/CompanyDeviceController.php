<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesTenantCompany;
use App\Http\Requests\StoreCompanyDeviceRequest;
use App\Http\Requests\UpdateCompanyDeviceRequest;
use App\Jobs\ActivateFiscalCloudDeviceJob;
use App\Models\CompanyDevice;
use App\Repositories\Interfaces\CompanyDeviceRepositoryInterface;
use Illuminate\Support\Facades\DB;

class CompanyDeviceController extends Controller
{
    use ResolvesTenantCompany;

    public function __construct(
        protected CompanyDeviceRepositoryInterface $repository
    ) {}

    public function index()
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        return response()->json(
            CompanyDevice::query()->where('company_id', $company->id)->orderBy('device_name')->get()
        );
    }

    public function show(string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = CompanyDevice::query()->where('company_id', $company->id)->where('id', $id)->first();
        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return response()->json($model);
    }

    public function store(StoreCompanyDeviceRequest $request)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $data = array_merge($request->validated(), ['company_id' => $company->id]);
        $model = $this->repository->create($data);

        return response()->json($model, 201);
    }

    public function update(UpdateCompanyDeviceRequest $request, string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = CompanyDevice::query()->where('company_id', $company->id)->where('id', $id)->first();
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

        $model = CompanyDevice::query()->where('company_id', $company->id)->where('id', $id)->first();
        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $model->delete();

        return response()->json(null, 204);
    }

    public function retryActivation(string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $device = CompanyDevice::query()->where('company_id', $company->id)->where('id', $id)->first();
        if (! $device) {
            return response()->json(['message' => 'Not found'], 404);
        }

        if ($device->fiscal_cloud_activated_at !== null || mb_strtoupper((string) $device->activation_status) === 'ACTIVATED') {
            return response()->json(['message' => 'Device is already activated.'], 422);
        }

        $environment = is_string($device->zimra_environment) && $device->zimra_environment !== '' ? $device->zimra_environment : 'test';

        DB::transaction(function () use ($device, $environment): void {
            $device->forceFill([
                'activation_status' => 'PENDING',
                'activation_error' => null,
            ])->save();

            ActivateFiscalCloudDeviceJob::dispatch((string) $device->id, $environment)->afterCommit();
        });

        return response()->json([
            'success' => true,
            'message' => 'Activation retry queued.',
        ]);
    }
}
