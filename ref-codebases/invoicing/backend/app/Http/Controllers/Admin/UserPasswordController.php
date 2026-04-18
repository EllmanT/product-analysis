<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

final class UserPasswordController extends Controller
{
    public function update(Request $request, User $user): RedirectResponse
    {
        if ($user->role === 'SUPER_ADMIN') {
            return redirect()
                ->route('admin.users.index')
                ->with('error', 'Super admin passwords cannot be reset here.');
        }

        $validated = $request->validate([
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user->password = $validated['password'];
        $user->save();

        return redirect()
            ->route('admin.users.index')
            ->with('success', 'Password reset successfully.');
    }
}

