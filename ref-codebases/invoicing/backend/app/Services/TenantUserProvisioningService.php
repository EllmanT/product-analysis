<?php

namespace App\Services;

use App\Models\Company;
use App\Models\User;

class TenantUserProvisioningService
{
    /**
     * Import users from Fiscal Cloud lookup (bcrypt passwords preserved).
     * Skips entries without a password hash (cannot log in yet).
     *
     * @param  list<array<string, mixed>>  $users
     */
    public function importFiscalCloudUsers(Company $company, array $users): int
    {
        $count = 0;

        foreach ($users as $u) {
            if (! is_array($u)) {
                continue;
            }

            $email = mb_strtolower(trim((string) ($u['email'] ?? '')));
            if ($email === '') {
                continue;
            }

            $rawPassword = $u['password'] ?? null;
            if (! is_string($rawPassword) || $rawPassword === '') {
                continue;
            }
            if (password_get_info($rawPassword)['algo'] === 0) {
                continue;
            }

            if (User::query()->whereRaw('LOWER(email) = ?', [$email])->exists()) {
                continue;
            }

            $roleRaw = strtolower((string) ($u['role'] ?? ''));
            $role = str_contains($roleRaw, 'admin') ? 'ADMIN' : 'USER';

            $first = mb_substr(trim((string) ($u['first_name'] ?? '')), 0, 100);
            $last = mb_substr(trim((string) ($u['last_name'] ?? '')), 0, 100);
            if ($first === '') {
                $first = 'User';
            }
            if ($last === '') {
                $last = 'User';
            }

            User::create([
                'company_id' => $company->id,
                'fiscal_cloud_user_id' => isset($u['id']) ? (int) $u['id'] : null,
                'first_name' => $first,
                'last_name' => $last,
                'email' => $email,
                'password' => $rawPassword,
                'role' => $role,
                'is_active' => true,
                'email_verified_at' => null,
            ]);

            $count++;
        }

        return $count;
    }
}
