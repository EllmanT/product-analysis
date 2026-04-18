<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\FiscalCloudApiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class FiscalCloudCompanyController extends Controller
{
    public function __construct(
        protected FiscalCloudApiService $fiscalCloudApi
    ) {}

    /**
     * Proxy company registration to Fiscal Cloud e-invoicing.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'trade_name' => ['nullable', 'string', 'max:255'],
            'company_phone' => ['nullable', 'string', 'max:50'],
            'company_email' => ['nullable', 'email', 'max:255'],
            'region' => ['nullable', 'string', 'max:120'],
            'station' => ['nullable', 'string', 'max:120'],
            'province' => ['nullable', 'string', 'max:120'],
            'city' => ['nullable', 'string', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
            'house_number' => ['nullable', 'string', 'max:50'],
            'tin' => ['required', 'string', 'max:50'],
            'vat' => ['nullable', 'string', 'max:50'],
            'tax_certificate' => ['required', 'file', 'max:10240'],
        ]);

        $file = $request->file('tax_certificate');
        if (! $file) {
            return response()->json([
                'success' => false,
                'message' => 'Tax certificate file is required.',
            ], 422);
        }

        $fields = [
            'name' => $validated['name'],
            'trade_name' => $validated['trade_name'] ?? null,
            'company_phone' => $validated['company_phone'] ?? null,
            'company_email' => $validated['company_email'] ?? null,
            'region' => $validated['region'] ?? null,
            'station' => $validated['station'] ?? null,
            'province' => $validated['province'] ?? null,
            'city' => $validated['city'] ?? null,
            'address' => $validated['address'] ?? null,
            'house_number' => $validated['house_number'] ?? null,
            'tin' => $validated['tin'],
            'vat' => $validated['vat'] ?? null,
        ];

        try {
            $data = $this->fiscalCloudApi->registerEInvoicingCompany($fields, $file);

            return response()->json([
                'success' => true,
                'data' => $data,
            ], 201);
        } catch (RuntimeException $e) {
            $code = $e->getCode();
            $status = ($code >= 400 && $code < 600) ? $code : 502;

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], $status);
        }
    }
}

