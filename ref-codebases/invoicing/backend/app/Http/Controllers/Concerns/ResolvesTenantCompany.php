<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Company;
use App\Models\Invoice;
use App\Models\User;

trait ResolvesTenantCompany
{
    /**
     * Active company for the authenticated local user (Sanctum).
     */
    protected function resolveCompany(): ?Company
    {
        $user = auth()->user();
        if (! $user instanceof User) {
            return null;
        }

        $companyId = $user->company_id;
        if (! is_string($companyId) || $companyId === '') {
            return null;
        }

        return Company::query()
            ->where('id', $companyId)
            ->where('is_active', true)
            ->first();
    }

    protected function tenantForbidden(): \Illuminate\Http\JsonResponse
    {
        return response()->json(['message' => 'No company is linked to this account.'], 403);
    }

    protected function invoiceForTenant(Company $company, string $invoiceId): ?Invoice
    {
        return Invoice::query()
            ->where('company_id', $company->id)
            ->where('id', $invoiceId)
            ->first();
    }
}
