<?php

namespace App\Http\Requests\Concerns;

use App\Models\Company;
use App\Models\User;
use App\Services\TenantHsCodeService;

trait ValidatesHsCodeForTenant
{
    public function withValidator($validator): void
    {
        $validator->after(function ($v): void {
            $code = $this->input('hs_code');
            if (! is_string($code) || $code === '') {
                return;
            }

            $user = auth()->user();
            if (! $user instanceof User) {
                return;
            }

            $companyId = $user->company_id;
            if (! is_string($companyId) || $companyId === '') {
                return;
            }

            $company = Company::query()
                ->where('id', $companyId)
                ->where('is_active', true)
                ->first();

            if ($company === null) {
                return;
            }

            $service = app(TenantHsCodeService::class);
            if (! $service->isCodeStringUsableForCompany($company, $code)) {
                $v->errors()->add(
                    'hs_code',
                    'This HS code is unknown, inactive, or not enabled for your company.'
                );
            }
        });
    }
}
