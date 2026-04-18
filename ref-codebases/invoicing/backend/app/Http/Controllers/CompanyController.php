<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesTenantCompany;
use App\Http\Requests\StoreCompanyRequest;
use App\Http\Requests\UpdateCompanyRequest;
use App\Models\Company;
use App\Repositories\Interfaces\CompanyRepositoryInterface;
use App\Services\TenantUserProvisioningService;

class CompanyController extends Controller
{
    use ResolvesTenantCompany;

    public function __construct(
        protected CompanyRepositoryInterface $repository,
        protected TenantUserProvisioningService $userProvisioning
    ) {}

    /**
     * Companies owned by the authenticated Auth0 user (typically one).
     */
    public function index()
    {
        $auth0Sub = auth()->id();
        if (! is_string($auth0Sub) || $auth0Sub === '') {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        return response()->json(
            Company::query()->where('auth0_user_id', $auth0Sub)->get()
        );
    }

    public function show(string|int $id)
    {
        $auth0Sub = auth()->id();
        if (! is_string($auth0Sub) || $auth0Sub === '') {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $model = Company::query()->where('auth0_user_id', $auth0Sub)->where('id', $id)->first();
        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return response()->json($model);
    }

    public function store(StoreCompanyRequest $request)
    {
        $auth0Sub = auth()->id();
        if (! is_string($auth0Sub) || $auth0Sub === '') {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $data = array_merge($request->validated(), ['auth0_user_id' => $auth0Sub]);
        $model = $this->repository->create($data);
        $this->userProvisioning->ensurePrimaryAdmin($model, $auth0Sub);

        return response()->json($model, 201);
    }

    public function update(UpdateCompanyRequest $request, string|int $id)
    {
        $auth0Sub = auth()->id();
        if (! is_string($auth0Sub) || $auth0Sub === '') {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $model = Company::query()->where('auth0_user_id', $auth0Sub)->where('id', $id)->first();
        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $model->update($request->validated());

        return response()->json($model->fresh());
    }

    public function destroy(string|int $id)
    {
        $auth0Sub = auth()->id();
        if (! is_string($auth0Sub) || $auth0Sub === '') {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $model = Company::query()->where('auth0_user_id', $auth0Sub)->where('id', $id)->first();
        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $model->delete();

        return response()->json(null, 204);
    }
}
