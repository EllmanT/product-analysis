<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Admin\Concerns\ResolvesAdminTableQuery;
use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

final class UserController extends Controller
{
    use ResolvesAdminTableQuery;

    public function index(Request $request): Response
    {
        ['per_page' => $perPage, 'q' => $q] = $this->tableParams($request);

        $users = User::query()
            ->with(['company:id,legal_name'])
            ->when($q !== '', function ($query) use ($q): void {
                $like = '%'.addcslashes($q, '%_\\').'%';
                $query->where(function ($w) use ($like): void {
                    $w->where('email', 'like', $like)
                        ->orWhere('first_name', 'like', $like)
                        ->orWhere('last_name', 'like', $like)
                        ->orWhere('phone', 'like', $like);
                });
            })
            ->orderByDesc('created_at')
            ->paginate($perPage)
            ->withQueryString();

        return Inertia::render('Admin/Users/Index', [
            'users' => $users,
            'filters' => [
                'q' => $q,
                'per_page' => $perPage,
            ],
        ]);
    }

    public function create(): Response
    {
        $companies = Company::query()
            ->where('is_active', true)
            ->orderBy('legal_name')
            ->get(['id', 'legal_name'])
            ->map(fn (Company $c): array => [
                'value' => $c->id,
                'label' => $c->legal_name,
            ])
            ->values()
            ->all();

        return Inertia::render('Admin/Users/Create', [
            'companies' => $companies,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:50'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'role' => ['required', Rule::in(['ADMIN', 'USER'])],
            'company_id' => ['nullable', 'uuid', 'exists:companies,id'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $companyId = $validated['company_id'] ?? null;
        if ($companyId === '') {
            $companyId = null;
        }

        User::query()->create([
            'company_id' => $companyId,
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'email' => mb_strtolower(trim($validated['email'])),
            'phone' => $validated['phone'] ?? null,
            'password' => $validated['password'],
            'role' => $validated['role'],
            'is_active' => (bool) ($validated['is_active'] ?? true),
            'email_verified_at' => null,
        ]);

        return redirect()->route('admin.users.index')->with('success', 'User created.');
    }

    public function show(User $user): Response
    {
        $user->load(['company:id,legal_name']);

        return Inertia::render('Admin/Users/Show', [
            'user' => $user->makeHidden(['password']),
        ]);
    }

    public function edit(User $user): Response
    {
        $companies = Company::query()
            ->where('is_active', true)
            ->orderBy('legal_name')
            ->get(['id', 'legal_name'])
            ->map(fn (Company $c): array => [
                'value' => $c->id,
                'label' => $c->legal_name,
            ])
            ->values()
            ->all();

        return Inertia::render('Admin/Users/Edit', [
            'user' => $user->makeHidden(['password']),
            'companies' => $companies,
        ]);
    }

    public function update(Request $request, User $user): RedirectResponse
    {
        if ($user->role === 'SUPER_ADMIN') {
            throw ValidationException::withMessages([
                'user' => ['Super admin users cannot be edited here.'],
            ]);
        }

        $validated = $request->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:50'],
            'role' => ['required', Rule::in(['ADMIN', 'USER'])],
            'company_id' => ['nullable', 'uuid', 'exists:companies,id'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $companyId = $validated['company_id'] ?? null;
        if ($companyId === '') {
            $companyId = null;
        }

        $user->update([
            'company_id' => $companyId,
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'email' => mb_strtolower(trim($validated['email'])),
            'phone' => $validated['phone'] ?? null,
            'role' => $validated['role'],
            'is_active' => isset($validated['is_active']) ? (bool) $validated['is_active'] : $user->is_active,
        ]);

        return redirect()->route('admin.users.show', $user)->with('success', 'User updated.');
    }

    public function destroy(User $user): RedirectResponse
    {
        if ($user->role === 'SUPER_ADMIN') {
            throw ValidationException::withMessages([
                'user' => ['Super admin users cannot be disabled.'],
            ]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'user' => ['User is already inactive.'],
            ]);
        }

        $user->update(['is_active' => false]);

        return redirect()->route('admin.users.index')->with('success', 'User disabled.');
    }
}
