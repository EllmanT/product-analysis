<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Admin\Concerns\ResolvesAdminTableQuery;
use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\CompanyDevice;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

final class CompanyController extends Controller
{
    use ResolvesAdminTableQuery;

    public function index(Request $request): Response
    {
        ['per_page' => $perPage, 'q' => $q] = $this->tableParams($request);

        $companies = Company::query()
            ->when($q !== '', function ($query) use ($q): void {
                $like = '%'.addcslashes($q, '%_\\').'%';
                $query->where(function ($w) use ($like): void {
                    $w->where('legal_name', 'like', $like)
                        ->orWhere('trade_name', 'like', $like)
                        ->orWhere('tin', 'like', $like)
                        ->orWhere('vat_number', 'like', $like)
                        ->orWhere('email', 'like', $like);
                });
            })
            ->select([
                'id',
                'legal_name',
                'trade_name',
                'tin',
                'vat_number',
                'email',
                'phone',
                'region',
                'station',
                'province',
                'city',
                'address_line',
                'house_number',
                'is_active',
                'created_at',
            ])
            ->orderByDesc('created_at')
            ->paginate($perPage)
            ->withQueryString();

        return Inertia::render('Admin/Companies/Index', [
            'companies' => $companies,
            'filters' => [
                'q' => $q,
                'per_page' => $perPage,
            ],
        ]);
    }

    public function show(Company $company): Response
    {
        $company->load([
            'companyHsCodes:id,company_id,hs_code_id,is_enabled',
        ]);

        $device = CompanyDevice::query()
            ->where('company_id', $company->id)
            ->orderByDesc('created_at')
            ->first();

        $users = User::query()
            ->where('company_id', $company->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get(['id', 'first_name', 'last_name', 'email', 'phone', 'role', 'is_active', 'created_at']);

        return Inertia::render('Admin/Companies/Show', [
            'company' => $company,
            'device' => $device,
            'users' => $users,
        ]);
    }

    public function edit(Company $company): Response
    {
        return Inertia::render('Admin/Companies/Edit', [
            'company' => $company,
        ]);
    }

    public function update(Request $request, Company $company): RedirectResponse
    {
        $validated = $request->validate([
            'legal_name' => ['required', 'string', 'max:255'],
            'trade_name' => ['nullable', 'string', 'max:255'],
            'tin' => ['required', 'string', 'max:50'],
            'vat_number' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'region' => ['nullable', 'string', 'max:120'],
            'station' => ['nullable', 'string', 'max:120'],
            'province' => ['nullable', 'string', 'max:120'],
            'city' => ['nullable', 'string', 'max:120'],
            'address_line' => ['nullable', 'string', 'max:255'],
            'house_number' => ['nullable', 'string', 'max:50'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $company->update([
            'legal_name' => $validated['legal_name'],
            'trade_name' => $validated['trade_name'] ?? null,
            'tin' => $validated['tin'],
            'vat_number' => $validated['vat_number'] ?? null,
            'email' => $validated['email'] ?? null,
            'phone' => $validated['phone'] ?? null,
            'region' => $validated['region'] ?? null,
            'station' => $validated['station'] ?? null,
            'province' => $validated['province'] ?? null,
            'city' => $validated['city'] ?? null,
            'address_line' => $validated['address_line'] ?? null,
            'house_number' => $validated['house_number'] ?? null,
            'is_active' => isset($validated['is_active']) ? (bool) $validated['is_active'] : $company->is_active,
        ]);

        return redirect()->route('admin.companies.show', $company)->with('success', 'Company updated.');
    }

    public function destroy(Company $company): RedirectResponse
    {
        if (! $company->is_active) {
            throw ValidationException::withMessages([
                'company' => ['Company is already inactive.'],
            ]);
        }

        DB::transaction(function () use ($company): void {
            $company->update(['is_active' => false]);

            CompanyDevice::query()
                ->where('company_id', $company->id)
                ->update(['is_active' => false]);

            User::query()
                ->where('company_id', $company->id)
                ->where('role', '!=', 'SUPER_ADMIN')
                ->update(['is_active' => false]);
        });

        return redirect()->route('admin.companies.index')->with('success', 'Company disabled.');
    }
}
