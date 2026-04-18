<?php

namespace App\Services;

use App\Models\Company;
use App\Models\CompanyHsCode;
use App\Models\HsCode;

class TenantHsCodeService
{
    /**
     * Whether the tenant may use this catalog HS code (global active + optional per-tenant override).
     */
    public function isHsCodeUsableForCompany(?Company $company, HsCode $hsCode): bool
    {
        if (! $hsCode->is_active) {
            return false;
        }

        if ($company === null) {
            return false;
        }

        $enabled = CompanyHsCode::query()
            ->where('company_id', $company->id)
            ->where('hs_code_id', $hsCode->id)
            ->value('is_enabled');

        if ($enabled === null) {
            return true;
        }

        return (bool) $enabled;
    }

    public function isCodeStringUsableForCompany(?Company $company, string $code): bool
    {
        $hsCode = HsCode::query()->where('code', $code)->first();

        if ($hsCode === null) {
            return false;
        }

        return $this->isHsCodeUsableForCompany($company, $hsCode);
    }
}
