<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\ActivateFiscalCloudDeviceJob;
use App\Models\Company;
use App\Models\CompanyDevice;
use App\Models\User;
use App\Services\FiscalCloudApiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class FiscalCompanyApplyController extends Controller
{
    public function __construct(
        protected FiscalCloudApiService $fiscalCloudApi
    ) {}

    /**
     * Authenticated flow: validate doc client-side, then create local company and register in Fiscal Cloud.
     */
    public function apply(Request $request): JsonResponse
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

        $validated = $request->validate([
            'vat_registered' => ['required', 'boolean'],
            'name' => ['required', 'string', 'max:255'],
            'trade_name' => ['required', 'string', 'max:255'],
            'tin' => ['required', 'string', 'regex:/^\d{10}$/'],
            'vat' => ['nullable', 'string', 'regex:/^\d{9}$/'],
            'region' => ['required', 'string', 'max:120'],
            'station' => ['required', 'string', 'max:120'],
            'province' => ['required', 'string', 'max:120'],
            'city' => ['required', 'string', 'max:120'],
            'address' => ['required', 'string', 'max:255'],
            'house_number' => ['required', 'string', 'regex:/^[1-9]\d*$/'],
            'company_phone' => ['required', 'string', 'regex:/^\d{8,}$/'],
            'company_email' => ['required', 'email', 'max:255'],
            'tax_certificate' => ['required', 'file', 'max:10240'],
        ]);

        $vatRegistered = (bool) $validated['vat_registered'];
        $vat = isset($validated['vat']) ? trim((string) $validated['vat']) : '';
        if ($vatRegistered && $vat === '') {
            return response()->json([
                'success' => false,
                'message' => 'VAT number is required for VAT registered taxpayers.',
            ], 422);
        }

        if (! $vatRegistered) {
            $vat = '';
        }

        $file = $request->file('tax_certificate');
        if (! $file) {
            return response()->json([
                'success' => false,
                'message' => 'Tax certificate file is required.',
            ], 422);
        }

        $fiscalFields = [
            'name' => (string) $validated['name'],
            'trade_name' => (string) $validated['trade_name'],
            'company_phone' => (string) $validated['company_phone'],
            'company_email' => (string) $validated['company_email'],
            'region' => (string) $validated['region'],
            'station' => (string) $validated['station'],
            'province' => (string) $validated['province'],
            'city' => (string) $validated['city'],
            'address' => (string) $validated['address'],
            'house_number' => (string) $validated['house_number'],
            'tin' => (string) $validated['tin'],
            'vat' => $vat !== '' ? $vat : null,
        ];

        try {
            $fiscalResponse = $this->fiscalCloudApi->registerEInvoicingCompany($fiscalFields, $file);
        } catch (RuntimeException $e) {
            $code = $e->getCode();
            $status = ($code >= 400 && $code < 600) ? $code : 502;

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], $status);
        }

        $fiscalCloudCompanyId = null;
        if (isset($fiscalResponse['id']) && is_scalar($fiscalResponse['id'])) {
            $fiscalCloudCompanyId = (string) $fiscalResponse['id'];
        } elseif (isset($fiscalResponse['data']['id']) && is_scalar($fiscalResponse['data']['id'])) {
            $fiscalCloudCompanyId = (string) $fiscalResponse['data']['id'];
        } elseif (isset($fiscalResponse['company']['id']) && is_scalar($fiscalResponse['company']['id'])) {
            $fiscalCloudCompanyId = (string) $fiscalResponse['company']['id'];
        } elseif (isset($fiscalResponse['data']['company']['id']) && is_scalar($fiscalResponse['data']['company']['id'])) {
            $fiscalCloudCompanyId = (string) $fiscalResponse['data']['company']['id'];
        }
        if (! is_string($fiscalCloudCompanyId) || $fiscalCloudCompanyId === '') {
            return response()->json([
                'success' => false,
                'message' => 'Fiscal Cloud did not return a company id.',
                'data' => $fiscalResponse,
            ], 502);
        }

        try {
            $devicePayload = [
                'device_name' => (string) $validated['trade_name'].' Main Device',
            ];
            $fiscalDeviceResponse = $this->fiscalCloudApi->createEInvoicingCompanyDevice($fiscalCloudCompanyId, $devicePayload);
        } catch (RuntimeException $e) {
            $code = $e->getCode();
            $status = ($code >= 400 && $code < 600) ? $code : 502;

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], $status);
        }

        $address = implode(', ', array_filter([
            $validated['house_number'] ?? null,
            $validated['address'] ?? null,
            $validated['city'] ?? null,
            $validated['province'] ?? null,
        ], fn ($v) => $v !== null && $v !== ''));

        $fiscalDeviceId = null;
        if (isset($fiscalDeviceResponse['id']) && is_scalar($fiscalDeviceResponse['id'])) {
            $fiscalDeviceId = (string) $fiscalDeviceResponse['id'];
        } elseif (isset($fiscalDeviceResponse['data']['id']) && is_scalar($fiscalDeviceResponse['data']['id'])) {
            $fiscalDeviceId = (string) $fiscalDeviceResponse['data']['id'];
        } elseif (isset($fiscalDeviceResponse['device']['id']) && is_scalar($fiscalDeviceResponse['device']['id'])) {
            $fiscalDeviceId = (string) $fiscalDeviceResponse['device']['id'];
        } elseif (isset($fiscalDeviceResponse['data']['device']['id']) && is_scalar($fiscalDeviceResponse['data']['device']['id'])) {
            $fiscalDeviceId = (string) $fiscalDeviceResponse['data']['device']['id'];
        }
        if (! is_string($fiscalDeviceId) || $fiscalDeviceId === '') {
            return response()->json([
                'success' => false,
                'message' => 'Fiscal Cloud did not return a device id.',
                'data' => $fiscalDeviceResponse,
            ], 502);
        }

        [$company, $companyDevice] = DB::transaction(function () use (
            $user,
            $validated,
            $fiscalCloudCompanyId,
            $address,
            $vat,
            $fiscalResponse,
            $fiscalDeviceId,
            $fiscalDeviceResponse
        ) {
            $company = Company::create([
                'fiscal_cloud_company_id' => $fiscalCloudCompanyId,
                'legal_name' => (string) $validated['name'],
                'trade_name' => (string) $validated['trade_name'],
                'tin' => (string) $validated['tin'],
                'vat_number' => $vat !== '' ? $vat : null,
                'region' => (string) $validated['region'],
                'station' => (string) $validated['station'],
                'province' => (string) $validated['province'],
                'city' => (string) $validated['city'],
                'address_line' => (string) $validated['address'],
                'house_number' => (string) $validated['house_number'],
                'address' => $address !== '' ? $address : null,
                'phone' => (string) $validated['company_phone'],
                'email' => (string) $validated['company_email'],
                'fiscal_cloud_payload' => $fiscalResponse,
                'is_service_company' => false,
                'default_tax_inclusive' => true,
                'default_currency' => 'ZWG',
                'is_active' => true,
            ]);

            $companyDevice = CompanyDevice::create([
                'company_id' => $company->id,
                'fiscal_device_id' => $fiscalDeviceId,
                'device_serial_no' => isset($fiscalDeviceResponse['device']['serial_number']) && is_scalar($fiscalDeviceResponse['device']['serial_number'])
                    ? (string) $fiscalDeviceResponse['device']['serial_number']
                    : (isset($fiscalDeviceResponse['data']['device']['serial_number']) && is_scalar($fiscalDeviceResponse['data']['device']['serial_number'])
                        ? (string) $fiscalDeviceResponse['data']['device']['serial_number']
                        : $fiscalDeviceId),
                'device_name' => isset($fiscalDeviceResponse['device_name']) && is_scalar($fiscalDeviceResponse['device_name'])
                    ? (string) $fiscalDeviceResponse['device_name']
                    : (string) $validated['trade_name'].' Main Device',
                'activation_status' => 'PENDING',
                'fiscal_day_status' => 'UNKNOWN',
                'is_active' => true,
                'fiscal_cloud_payload' => $fiscalDeviceResponse,
            ]);

            $user->company_id = $company->id;
            $user->role = $user->role ?: 'ADMIN';
            if ($user->phone === null || $user->phone === '') {
                $user->phone = (string) $validated['company_phone'];
            }
            $user->save();

            return [$company, $companyDevice];
        });

        // Dispatch activation in background after DB commit.
        ActivateFiscalCloudDeviceJob::dispatch($companyDevice->id, 'test')->afterCommit();

        return response()->json([
            'success' => true,
            'message' => 'Company and device created. Activation is processing in the background.',
            'data' => [
                'company' => $company,
                'company_device' => $companyDevice,
                'fiscal_cloud' => [
                    'company' => $fiscalResponse,
                    'device' => $fiscalDeviceResponse,
                ],
            ],
        ], 201);
    }
}

