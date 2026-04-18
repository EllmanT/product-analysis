<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

final class SuperAdminSeeder extends Seeder
{
    /**
     * Ensures a SUPER_ADMIN user exists for the admin panel (session login at /admin/login).
     * Re-running updates the password to match the seeded value.
     */
    public function run(): void
    {
        User::query()->updateOrCreate(
            ['email' => 'mndlovu@axissol.com'],
            [
                'first_name' => 'Super',
                'last_name' => 'Admin',
                'password' => 'Password123#',
                'role' => 'SUPER_ADMIN',
                'company_id' => null,
                'is_active' => true,
                'email_verified_at' => now(),
            ],
        );
    }
}
