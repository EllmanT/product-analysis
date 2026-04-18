<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\User;
use App\Services\UserActivationCodeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function loginWithActivationCode(Request $request, UserActivationCodeService $activationCodeService): JsonResponse
    {
        $data = $request->validate([
            'activation_code' => ['required', 'string', 'max:32'],
        ]);

        $normalized = $activationCodeService->normalize($data['activation_code']);
        if (strlen($normalized) !== 6) {
            throw ValidationException::withMessages([
                'activation_code' => ['The activation code must be exactly 6 characters.'],
            ]);
        }

        $record = $activationCodeService->findActiveByPlainCode($normalized);
        if ($record === null || $record->user === null) {
            throw ValidationException::withMessages([
                'activation_code' => [__('auth.failed')],
            ]);
        }

        $user = $record->user;

        if ($user->isSuperAdmin()) {
            return response()->json(['message' => 'Activation codes cannot be used for this account type.'], 403);
        }

        if ($user->company_id === null || $user->company_id === '') {
            return response()->json(['message' => 'No company is linked to this account.'], 403);
        }

        if (! $user->is_active) {
            return response()->json(['message' => 'Account is inactive.'], 403);
        }

        $activationCodeService->touchLastUsed($record);

        $token = $user->createToken('activation')->plainTextToken;

        return response()->json([
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => $user->makeHidden(['password']),
        ]);
    }

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $email = mb_strtolower(trim($credentials['email']));

        /** @var User|null $user */
        $user = User::query()->whereRaw('LOWER(email) = ?', [$email])->first();

        if (! $user || ! $user->password || ! Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => [__('auth.failed')],
            ]);
        }

        if (! $user->is_active) {
            return response()->json(['message' => 'Account is inactive.'], 403);
        }

        $token = $user->createToken('spa')->plainTextToken;

        return response()->json([
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => $user->makeHidden(['password']),
        ]);
    }

    /**
     * Public sign-up: creates a user account without company details (company can be added later).
     */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['required', 'string', 'max:50'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ], [
            'email.unique' => 'An account with this email already exists.',
            'password.min' => 'Password must be at least 8 characters.',
            'phone.required' => 'Phone number is required.',
        ]);

        $email = mb_strtolower(trim($data['email']));

        $user = User::create([
            'company_id' => null,
            'first_name' => $data['first_name'],
            'last_name' => $data['last_name'],
            'email' => $email,
            'phone' => trim((string) $data['phone']),
            'password' => $data['password'],
            'role' => 'ADMIN',
            'is_active' => true,
            'email_verified_at' => null,
        ]);

        $token = $user->createToken('spa')->plainTextToken;

        return response()->json([
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => $user->makeHidden(['password']),
        ], 201);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out']);
    }

    public function user(Request $request): JsonResponse
    {
        $user = $request->user();
        $company = null;
        if ($user->company_id) {
            $company = Company::query()
                ->where('id', $user->company_id)
                ->where('is_active', true)
                ->first([
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
                    'axis_billing_customer_id',
                ]);
        }

        return response()->json([
            'user' => $user->makeHidden(['password']),
            'company' => $company,
        ]);
    }
}
