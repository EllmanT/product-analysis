<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesTenantCompany;
use App\Http\Requests\StoreInvoiceTaxRequest;
use App\Http\Requests\UpdateInvoiceTaxRequest;
use App\Models\InvoiceTax;
use App\Repositories\Interfaces\InvoiceTaxRepositoryInterface;

class InvoiceTaxController extends Controller
{
    use ResolvesTenantCompany;

    public function __construct(
        protected InvoiceTaxRepositoryInterface $repository
    ) {}

    public function index()
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        return response()->json(
            InvoiceTax::query()
                ->whereHas('invoice', fn ($q) => $q->where('company_id', $company->id))
                ->orderBy('invoice_id')
                ->get()
        );
    }

    public function show(string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = InvoiceTax::query()
            ->whereHas('invoice', fn ($q) => $q->where('company_id', $company->id))
            ->where('id', $id)
            ->first();

        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return response()->json($model);
    }

    public function store(StoreInvoiceTaxRequest $request)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $data = $request->validated();
        if ($this->invoiceForTenant($company, $data['invoice_id']) === null) {
            return response()->json(['message' => 'Invoice not found'], 404);
        }

        $model = $this->repository->create($data);

        return response()->json($model, 201);
    }

    public function update(UpdateInvoiceTaxRequest $request, string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = InvoiceTax::query()
            ->whereHas('invoice', fn ($q) => $q->where('company_id', $company->id))
            ->where('id', $id)
            ->first();

        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $data = $request->validated();
        if (isset($data['invoice_id']) && $this->invoiceForTenant($company, $data['invoice_id']) === null) {
            return response()->json(['message' => 'Invoice not found'], 404);
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

        $model = InvoiceTax::query()
            ->whereHas('invoice', fn ($q) => $q->where('company_id', $company->id))
            ->where('id', $id)
            ->first();

        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $model->delete();

        return response()->json(null, 204);
    }
}
