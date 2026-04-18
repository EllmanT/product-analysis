<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\UserActivationCodeService;
use Illuminate\Http\RedirectResponse;
use RuntimeException;

final class UserActivationCodeController extends Controller
{
    public function store(User $user, UserActivationCodeService $service): RedirectResponse
    {
        if ($user->role === 'SUPER_ADMIN') {
            return redirect()->back()->with('error', 'Super admin accounts cannot use activation codes.');
        }

        if ($user->company_id === null || $user->company_id === '') {
            return redirect()->back()->with('error', 'User must belong to a company.');
        }

        try {
            $plain = $service->issueForUser($user);
        } catch (RuntimeException $e) {
            return redirect()->back()->with('error', $e->getMessage());
        }

        return redirect()
            ->back()
            ->with('success', sprintf('New activation code issued for %s.', $user->email))
            ->with('activation_code_plain', $plain);
    }
}
