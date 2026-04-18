<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesTenantCompany;
use App\Http\Requests\StoreInvoiceLineRequest;
use App\Http\Requests\UpdateInvoiceLineRequest;
use App\Models\InvoiceLine;
use App\Models\Product;
use App\Repositories\Interfaces\InvoiceLineRepositoryInterface;

class InvoiceLineController extends Controller
{
    use ResolvesTenantCompany;

    public function __construct(
        protected InvoiceLineRepositoryInterface $repository
    ) {}

    public function index()
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        return response()->json(
            InvoiceLine::query()
                ->whereHas('invoice', fn ($q) => $q->where('company_id', $company->id))
                ->with('invoice')
                ->orderBy('invoice_id')
                ->orderBy('line_no')
                ->get()
        );
    }

    public function show(string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = InvoiceLine::query()
            ->whereHas('invoice', fn ($q) => $q->where('company_id', $company->id))
            ->where('id', $id)
            ->first();

        if (! $model) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return response()->json($model);
    }

    public function store(StoreInvoiceLineRequest $request)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $data = $request->validated();
        if ($this->invoiceForTenant($company, $data['invoice_id']) === null) {
            return response()->json(['message' => 'Invoice not found'], 404);
        }

        if (! empty($data['product_id'])) {
            $productOk = Product::query()
                ->where('company_id', $company->id)
                ->where('id', $data['product_id'])
                ->exists();
            if (! $productOk) {
                return response()->json(['message' => 'Product does not belong to your company.'], 422);
            }
        }

        $model = $this->repository->create($data);

        return response()->json($model, 201);
    }

    public function update(UpdateInvoiceLineRequest $request, string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $model = InvoiceLine::query()
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
        if (array_key_exists('product_id', $data) && $data['product_id'] !== null) {
            $productOk = Product::query()
                ->where('company_id', $company->id)
                ->where('id', $data['product_id'])
                ->exists();
            if (! $productOk) {
                return response()->json(['message' => 'Product does not belong to your company.'], 422);
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

        $model = InvoiceLine::query()
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
