<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\NonFiscalizedCompany;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class NonFiscalizedCompanyController extends Controller
{
    /**
     * Public registration: creates tenant company + local admin user (password stored in app DB).
     */
    public function registerPublic(Request $request): JsonResponse
    {
        return $this->register($request);
    }

    public function register(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'company_name' => ['required', 'string', 'max:255'],
            'registration_number' => ['required', 'string', 'max:100', 'unique:non_fiscalized_companies,registration_number'],
            'tax_id' => ['nullable', 'string', 'max:50'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['required', 'string', 'max:50'],
            'physical_address' => ['nullable', 'string'],
            'city' => ['nullable', 'string', 'max:100'],
            'country' => ['required', 'string', 'max:100'],
            'postal_code' => ['nullable', 'string', 'max:20'],
            'admin_first_name' => ['required', 'string', 'max:100'],
            'admin_last_name' => ['required', 'string', 'max:100'],
            'admin_email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'admin_phone' => ['required', 'string', 'max:50'],
            'admin_password' => ['required', 'string', 'min:8', 'confirmed'],
        ], [
            'company_name.required' => 'Company name is required',
            'registration_number.required' => 'Registration number is required',
            'registration_number.unique' => 'A company with this registration number already exists',
            'email.required' => 'Company email is required',
            'email.email' => 'Please provide a valid email address',
            'phone.required' => 'Company phone number is required',
            'country.required' => 'Country is required',
            'admin_first_name.required' => 'Administrator first name is required',
            'admin_last_name.required' => 'Administrator last name is required',
            'admin_email.required' => 'Administrator email is required',
            'admin_email.unique' => 'An account with this email already exists',
            'admin_phone.required' => 'Administrator phone number is required',
            'admin_password.required' => 'Password is required',
            'admin_password.min' => 'Password must be at least 8 characters',
            'admin_password.confirmed' => 'Password confirmation does not match',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $adminEmail = mb_strtolower(trim((string) $request->admin_email));

        try {
            [$onboarding, $tenantCompany, $adminUser] = DB::transaction(function () use ($request, $adminEmail) {
                $company = NonFiscalizedCompany::create([
                    'company_name' => $request->company_name,
                    'registration_number' => $request->registration_number,
                    'tax_id' => $request->tax_id,
                    'email' => $request->email,
                    'phone' => $request->phone,
                    'physical_address' => $request->physical_address,
                    'city' => $request->city,
                    'country' => $request->country,
                    'postal_code' => $request->postal_code,
                    'admin_first_name' => $request->admin_first_name,
                    'admin_last_name' => $request->admin_last_name,
                    'admin_email' => $adminEmail,
                    'admin_phone' => $request->admin_phone,
                    'admin_password' => '',
                    'is_active' => true,
                    'email_verified' => false,
                    'email_verified_at' => null,
                ]);

                $tenantCompany = Company::create([
                    'fiscal_cloud_company_id' => 'nf-'.$company->id,
                    'legal_name' => $company->company_name,
                    'trade_name' => null,
                    'tin' => $company->tax_id ?: $company->registration_number,
                    'vat_number' => null,
                    'address' => $this->formatAddress(
                        $company->physical_address,
                        $company->city,
                        $company->country,
                        $company->postal_code
                    ),
                    'phone' => $company->phone,
                    'email' => $company->email,
                    'is_service_company' => true,
                    'default_tax_inclusive' => true,
                    'default_currency' => 'ZWG',
                    'is_active' => true,
                ]);

                $adminUser = User::create([
                    'company_id' => $tenantCompany->id,
                    'first_name' => $request->admin_first_name,
                    'last_name' => $request->admin_last_name,
                    'email' => $adminEmail,
                    'phone' => $request->admin_phone,
                    'password' => (string) $request->admin_password,
                    'role' => 'ADMIN',
                    'is_active' => true,
                    'email_verified_at' => null,
                ]);

                return [$company, $tenantCompany, $adminUser];
            });

            $token = $adminUser->createToken('spa')->plainTextToken;

            return response()->json([
                'success' => true,
                'message' => 'Company registered successfully',
                'token' => $token,
                'token_type' => 'Bearer',
                'data' => [
                    'id' => $onboarding->id,
                    'company_name' => $onboarding->company_name,
                    'registration_number' => $onboarding->registration_number,
                    'email' => $onboarding->email,
                    'admin_email' => $onboarding->admin_email,
                    'is_active' => $onboarding->is_active,
                    'email_verified' => $onboarding->email_verified,
                    'tenant_company_id' => $tenantCompany->id,
                    'created_at' => $onboarding->created_at,
                    'user' => $adminUser->makeHidden(['password']),
                ],
            ], 201);
        } catch (\Exception $e) {
            \Log::error('Non-fiscalized company registration failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'An error occurred while registering the company. Please try again.',
            ], 500);
        }
    }

    /**
     * Authenticated: link a company to the current user (user signed up without company details).
     */
    public function completeProfile(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user instanceof User) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated'], 401);
        }

        if (is_string($user->company_id) && $user->company_id !== '') {
            return response()->json([
                'success' => false,
                'message' => 'A company is already linked to this account.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'company_name' => ['required', 'string', 'max:255'],
            'registration_number' => ['required', 'string', 'max:100', 'unique:non_fiscalized_companies,registration_number'],
            'tax_id' => ['nullable', 'string', 'max:50'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['required', 'string', 'max:50'],
            'physical_address' => ['nullable', 'string'],
            'city' => ['nullable', 'string', 'max:100'],
            'country' => ['required', 'string', 'max:100'],
            'postal_code' => ['nullable', 'string', 'max:20'],
        ], [
            'company_name.required' => 'Company name is required',
            'registration_number.required' => 'Registration number is required',
            'registration_number.unique' => 'A company with this registration number already exists',
            'email.required' => 'Company email is required',
            'phone.required' => 'Company phone number is required',
            'country.required' => 'Country is required',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $adminEmail = mb_strtolower(trim((string) $user->email));

        try {
            [$onboarding, $tenantCompany] = DB::transaction(function () use ($request, $user, $adminEmail) {
                $company = NonFiscalizedCompany::create([
                    'company_name' => $request->company_name,
                    'registration_number' => $request->registration_number,
                    'tax_id' => $request->tax_id,
                    'email' => $request->email,
                    'phone' => $request->phone,
                    'physical_address' => $request->physical_address,
                    'city' => $request->city,
                    'country' => $request->country,
                    'postal_code' => $request->postal_code,
                    'admin_first_name' => $user->first_name,
                    'admin_last_name' => $user->last_name,
                    'admin_email' => $adminEmail,
                    'admin_phone' => $user->phone ?? $request->phone,
                    'admin_password' => '',
                    'is_active' => true,
                    'email_verified' => false,
                    'email_verified_at' => null,
                ]);

                $tenantCompany = Company::create([
                    'fiscal_cloud_company_id' => 'nf-'.$company->id,
                    'legal_name' => $company->company_name,
                    'trade_name' => null,
                    'tin' => $company->tax_id ?: $company->registration_number,
                    'vat_number' => null,
                    'address' => $this->formatAddress(
                        $company->physical_address,
                        $company->city,
                        $company->country,
                        $company->postal_code
                    ),
                    'phone' => $company->phone,
                    'email' => $company->email,
                    'is_service_company' => true,
                    'default_tax_inclusive' => true,
                    'default_currency' => 'ZWG',
                    'is_active' => true,
                ]);

                $user->company_id = $tenantCompany->id;
                $user->role = 'ADMIN';
                if ($user->phone === null || $user->phone === '') {
                    $user->phone = $request->phone;
                }
                $user->save();

                return [$company, $tenantCompany];
            });

            return response()->json([
                'success' => true,
                'message' => 'Company registered successfully',
                'data' => [
                    'id' => $onboarding->id,
                    'company_name' => $onboarding->company_name,
                    'registration_number' => $onboarding->registration_number,
                    'email' => $onboarding->email,
                    'admin_email' => $onboarding->admin_email,
                    'is_active' => $onboarding->is_active,
                    'email_verified' => $onboarding->email_verified,
                    'tenant_company_id' => $tenantCompany->id,
                    'created_at' => $onboarding->created_at,
                ],
            ], 201);
        } catch (\Exception $e) {
            \Log::error('Non-fiscalized company complete profile failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'An error occurred while saving your company. Please try again.',
            ], 500);
        }
    }

    private function formatAddress(
        ?string $physicalAddress,
        ?string $city,
        ?string $country,
        ?string $postalCode
    ): ?string {
        $parts = array_filter([
            $physicalAddress,
            $city,
            $country,
            $postalCode,
        ], fn (?string $value) => $value !== null && trim($value) !== '');

        if ($parts === []) {
            return null;
        }

        return implode(', ', array_map(static fn (string $value) => trim($value), $parts));
    }

    /**
     * Authenticated: return onboarding record for the current user's company (by admin email match).
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user instanceof User) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated'], 401);
        }

        $company = NonFiscalizedCompany::where('admin_email', $user->email)->first();

        if (! $company) {
            return response()->json([
                'success' => false,
                'message' => 'Company not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $company->id,
                'company_name' => $company->company_name,
                'registration_number' => $company->registration_number,
                'tax_id' => $company->tax_id,
                'email' => $company->email,
                'phone' => $company->phone,
                'physical_address' => $company->physical_address,
                'city' => $company->city,
                'country' => $company->country,
                'postal_code' => $company->postal_code,
                'admin_first_name' => $company->admin_first_name,
                'admin_last_name' => $company->admin_last_name,
                'admin_email' => $company->admin_email,
                'admin_phone' => $company->admin_phone,
                'is_active' => $company->is_active,
                'email_verified' => $company->email_verified,
                'created_at' => $company->created_at,
                'updated_at' => $company->updated_at,
            ],
        ], 200);
    }

    public function show(string $id): JsonResponse
    {
        $user = request()->user();
        if (! $user instanceof User) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated'], 401);
        }

        $company = NonFiscalizedCompany::where('id', $id)->where('admin_email', $user->email)->first();

        if (! $company) {
            return response()->json([
                'success' => false,
                'message' => 'Company not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $company->id,
                'company_name' => $company->company_name,
                'registration_number' => $company->registration_number,
                'tax_id' => $company->tax_id,
                'email' => $company->email,
                'phone' => $company->phone,
                'physical_address' => $company->physical_address,
                'city' => $company->city,
                'country' => $company->country,
                'postal_code' => $company->postal_code,
                'admin_first_name' => $company->admin_first_name,
                'admin_last_name' => $company->admin_last_name,
                'admin_email' => $company->admin_email,
                'admin_phone' => $company->admin_phone,
                'is_active' => $company->is_active,
                'email_verified' => $company->email_verified,
                'email_verified_at' => $company->email_verified_at,
                'created_at' => $company->created_at,
                'updated_at' => $company->updated_at,
            ],
        ], 200);
    }
}
