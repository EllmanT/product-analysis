<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesTenantCompany;
use App\Http\Requests\SyncCompanyHsCodePreferencesRequest;
use App\Models\CompanyHsCode;
use App\Models\HsCode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CompanyHsCodeController extends Controller
{
    use ResolvesTenantCompany;

    /**
     * Paginated HS codes for the tenant, including per-company enable preference.
     */
    public function index(Request $request): JsonResponse
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $perPage = min(max($request->integer('per_page', 50), 1), 200);

        $query = HsCode::query()
            ->selectRaw('hs_codes.*, company_hs_codes.is_enabled as tenant_is_enabled')
            ->leftJoin('company_hs_codes', function ($join) use ($company): void {
                $join->on('company_hs_codes.hs_code_id', '=', 'hs_codes.id')
                    ->where('company_hs_codes.company_id', '=', $company->id);
            })
            ->orderBy('hs_codes.code');

        if ($request->filled('search')) {
            $search = $request->string('search')->trim();
            $query->where(function ($q) use ($search): void {
                $q->where('hs_codes.code', 'like', '%'.$search.'%')
                    ->orWhere('hs_codes.description', 'like', '%'.$search.'%');
            });
        }

        if ($request->boolean('usable_only')) {
            $query->where('hs_codes.is_active', true)
                ->where(function ($q): void {
                    $q->whereNull('company_hs_codes.is_enabled')
                        ->orWhere('company_hs_codes.is_enabled', true);
                });
        }

        $paginator = $query->paginate($perPage);

        $mapped = $paginator->through(function (HsCode $row) {
            $p = $row->tenant_is_enabled;

            return [
                'id' => $row->id,
                'code' => $row->code,
                'description' => $row->description,
                'category' => $row->category,
                'is_service' => (bool) $row->is_service,
                'default_tax_code' => $row->default_tax_code,
                'is_active' => (bool) $row->is_active,
                'tenant_preference_enabled' => $p === null ? null : (bool) $p,
                'usable_for_company' => (bool) $row->is_active && ($p === null || (bool) $p),
                'created_at' => $row->created_at,
                'updated_at' => $row->updated_at,
            ];
        });

        return response()->json($mapped);
    }

    /**
     * Upsert per-tenant HS code enablement (batch).
     */
    public function syncPreferences(SyncCompanyHsCodePreferencesRequest $request): JsonResponse
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $items = $request->validated('items');

        DB::transaction(function () use ($company, $items): void {
            foreach ($items as $item) {
                CompanyHsCode::query()->updateOrCreate(
                    [
                        'company_id' => $company->id,
                        'hs_code_id' => $item['hs_code_id'],
                    ],
                    ['is_enabled' => $item['is_enabled']]
                );
            }
        });

        return response()->json(['message' => 'Preferences updated'], 200);
    }

    /**
     * Enable all active catalog HS codes for the tenant (clear overrides) or disable all active codes.
     */
    public function setAll(Request $request): JsonResponse
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $validated = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        $enabled = $validated['enabled'];

        DB::transaction(function () use ($company, $enabled): void {
            if ($enabled) {
                CompanyHsCode::query()->where('company_id', $company->id)->delete();
            } else {
                HsCode::query()
                    ->where('is_active', true)
                    ->orderBy('id')
                    ->chunk(500, function ($codes) use ($company): void {
                        foreach ($codes as $hs) {
                            CompanyHsCode::query()->updateOrCreate(
                                [
                                    'company_id' => $company->id,
                                    'hs_code_id' => $hs->id,
                                ],
                                ['is_enabled' => false]
                            );
                        }
                    });
            }
        });

        return response()->json([
            'message' => $enabled
                ? 'All HS code preferences reset: active catalog codes are enabled by default.'
                : 'All active HS codes were turned off for your company.',
        ], 200);
    }
}
