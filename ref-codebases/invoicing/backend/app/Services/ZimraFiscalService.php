<?php

namespace App\Services;

use App\Models\CompanyDevice;
use App\Models\FiscalResponse;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * ZIMRA Fiscal Device Management System (FDMS) Integration Service
 *
 * Integrates with ZIMRA Virtual Fiscal Device API for invoice fiscalization.
 * Based on VirtualFiscalDevice_MultiTenant_API_Guide.pdf specification.
 */
class ZimraFiscalService
{
    private string $baseUrl;

    private int $timeout = 30;

    public function __construct()
    {
        $this->baseUrl = config('services.zimra.api_url', 'http://140.82.25.196:10005');
    }

    /**
     * Submit a fiscal invoice to ZIMRA FDMS.
     * Flow: GetStatus -> validate -> SubmitReceipt.
     */
    public function submitFiscalInvoice(Invoice $invoice): array
    {
        try {
            // Mandatory pre-check before posting fiscal invoice.
            // 1) If status code is not "1" => fiscal day error (contact support)
            // 2) If fiscal day is closed => ask client to open fiscal day first
            $deviceStatus = $this->getVirtualDeviceStatus();
            if (! $deviceStatus['success']) {
                return [
                    'success' => false,
                    'message' => $deviceStatus['message'] ?? 'Failed to verify fiscal device status.',
                ];
            }

            $fiscalDayStatus = (string) ($deviceStatus['fiscal_day_status'] ?? '');
            if (strcasecmp($fiscalDayStatus, 'FiscalDayClosed') === 0) {
                return [
                    'success' => false,
                    'message' => 'Fiscal day is closed. Please open fiscal day before posting fiscal invoices.',
                ];
            }

            $virtualDeviceId = (string) data_get($deviceStatus, 'data.DeviceID', '');

            // Build request payload
            $payload = $this->buildInvoicePayload($invoice);
            if (empty($payload['receiptLines']) || ! is_array($payload['receiptLines'])) {
                return [
                    'success' => false,
                    'message' => 'Invoice has no line items to fiscalize. Please add at least one line.',
                ];
            }

            // Submit to Virtual Device
            Log::info('ZIMRA SubmitReceipt request', [
                'url' => "{$this->baseUrl}/api/VirtualDevice/SubmitReceipt",
                'invoice_id' => $invoice->id,
                'payload' => $payload,
            ]);
            $response = Http::timeout($this->timeout)
                ->withHeaders([
                    'Content-Type' => 'application/json',
                    'Accept' => '*/*',
                ])
                ->post("{$this->baseUrl}/api/VirtualDevice/SubmitReceipt", $payload);

            $responseData = $response->json();
            if (! is_array($responseData)) {
                $responseData = [];
            }
            Log::info('ZIMRA SubmitReceipt response', [
                'url' => "{$this->baseUrl}/api/VirtualDevice/SubmitReceipt",
                'invoice_id' => $invoice->id,
                'status' => $response->status(),
                'response' => $responseData,
            ]);

            $resolvedDevice = null;
            $virtualSerial = (string) (
                data_get($deviceStatus, 'data.DeviceSerialNumber')
                ?? ($responseData['DeviceSerialNumber'] ?? '')
            );

            if ($virtualDeviceId !== '') {
                $resolvedDevice = CompanyDevice::query()
                    ->where('company_id', $invoice->company_id)
                    ->where('fiscal_device_id', $virtualDeviceId)
                    ->first();
            }

            if ($resolvedDevice === null && $virtualSerial !== '') {
                $resolvedDevice = CompanyDevice::query()
                    ->where('company_id', $invoice->company_id)
                    ->where('device_serial_no', $virtualSerial)
                    ->first();
            }

            if ($resolvedDevice === null && ! empty($invoice->device_id)) {
                $resolvedDevice = CompanyDevice::query()
                    ->where('company_id', $invoice->company_id)
                    ->where('id', $invoice->device_id)
                    ->first();
            }

            // Save fiscal response (best effort; should not fail fiscal API flow)
            $fiscalResponse = null;
            try {
                $fiscalResponse = $this->saveFiscalResponse($invoice, $responseData, $resolvedDevice);
            } catch (\Throwable $e) {
                Log::error('ZIMRA fiscal response persistence failed', [
                    'invoice_id' => $invoice->id,
                    'error' => $e->getMessage(),
                ]);
            }

            $virtualCode = (string) ($responseData['Code'] ?? $responseData['code'] ?? '');
            if ($response->successful() && $virtualCode === '1') {
                // Update invoice status
                $invoice->update([
                    'status' => 'SUBMITTED',
                    'fiscal_submission_at' => now(),
                ]);

                return [
                    'success' => true,
                    'message' => 'Invoice fiscalized successfully',
                    'fiscal_response' => $fiscalResponse,
                    'data' => $responseData['data'] ?? $responseData,
                ];
            }

            return [
                'success' => false,
                'message' => (string) ($responseData['Message'] ?? $responseData['message'] ?? 'Fiscalization failed'),
                'errors' => $responseData['errors'] ?? null,
                'fiscal_response' => $fiscalResponse,
            ];

        } catch (\Exception $e) {
            Log::error('ZIMRA Fiscalization Error', [
                'invoice_id' => $invoice->id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return [
                'success' => false,
                'message' => 'System error: '.$e->getMessage(),
            ];
        }
    }

    /**
     * Check virtual device status before fiscal posting.
     * Expected response shape (sample):
     *   Code: "1" | "0"
     *   Data.fiscalDayStatus: "FiscalDayOpened" | "FiscalDayClosed" | ...
     */
    public function getVirtualDeviceStatus(): array
    {
        try {
            Log::info('ZIMRA GetStatus request', [
                'url' => "{$this->baseUrl}/api/VirtualDevice/GetStatus",
            ]);
            $response = Http::timeout($this->timeout)
                ->withHeaders([
                    'Accept' => '*/*',
                ])
                ->get("{$this->baseUrl}/api/VirtualDevice/GetStatus");

            $data = $response->json();
            if (! is_array($data)) {
                $data = [];
            }
            Log::info('ZIMRA GetStatus response', [
                'url' => "{$this->baseUrl}/api/VirtualDevice/GetStatus",
                'status' => $response->status(),
                'response' => $data,
            ]);

            $statusCode = (string) ($data['Code'] ?? $data['code'] ?? '');
            if ($statusCode !== '1') {
                return [
                    'success' => false,
                    'message' => 'There is a fiscal day error. Contact support@axissol.com.',
                    'code' => $statusCode,
                    'data' => $data,
                ];
            }

            $fiscalDayStatus = (string) data_get($data, 'Data.fiscalDayStatus', '');

            return [
                'success' => true,
                'code' => $statusCode,
                'fiscal_day_status' => $fiscalDayStatus,
                'data' => $data,
            ];
        } catch (\Exception $e) {
            Log::error('VirtualDevice GetStatus Error', [
                'error' => $e->getMessage(),
            ]);

            return [
                'success' => false,
                'message' => 'Unable to verify fiscal device status. Please try again.',
                'code' => null,
            ];
        }
    }

    /**
     * Open a fiscal day for the device
     */
    public function openFiscalDay(): array
    {
        try {
            Log::info('ZIMRA OpenFiscalDay request', [
                'url' => "{$this->baseUrl}/api/VirtualDevice/OpenFiscalDay",
            ]);
            $response = Http::timeout($this->timeout)
                ->withHeaders([
                    'Accept' => '*/*',
                ])
                ->get("{$this->baseUrl}/api/VirtualDevice/OpenFiscalDay");

            $data = $response->json();
            if (! is_array($data)) {
                $data = [];
            }
            Log::info('ZIMRA OpenFiscalDay response', [
                'url' => "{$this->baseUrl}/api/VirtualDevice/OpenFiscalDay",
                'status' => $response->status(),
                'response' => $data,
            ]);

            $code = (string) ($data['Code'] ?? $data['code'] ?? '');
            $message = (string) ($data['Message'] ?? $data['message'] ?? 'Unknown error');

            if ($response->successful() && $code === '1') {
                return ['success' => true, 'data' => $data];
            }

            return [
                'success' => false,
                'message' => $message !== '' ? $message : 'Failed to open fiscal day.',
            ];

        } catch (\Exception $e) {
            Log::error('ZIMRA Open Fiscal Day Error', [
                'error' => $e->getMessage(),
            ]);

            return ['success' => false, 'message' => 'Error opening fiscal day: '.$e->getMessage()];
        }
    }

    /**
     * Close a fiscal day for the device
     */
    public function closeFiscalDay(): array
    {
        try {
            Log::info('ZIMRA CloseFiscalDay request', [
                'url' => "{$this->baseUrl}/api/VirtualDevice/CloseFiscalDay",
            ]);
            $response = Http::timeout($this->timeout)
                ->withHeaders([
                    'Accept' => '*/*',
                ])
                ->get("{$this->baseUrl}/api/VirtualDevice/CloseFiscalDay");

            $data = $response->json();
            if (! is_array($data)) {
                $data = [];
            }
            Log::info('ZIMRA CloseFiscalDay response', [
                'url' => "{$this->baseUrl}/api/VirtualDevice/CloseFiscalDay",
                'status' => $response->status(),
                'response' => $data,
            ]);

            $code = (string) ($data['Code'] ?? $data['code'] ?? '');
            $message = (string) ($data['Message'] ?? $data['message'] ?? 'Unknown error');

            if ($response->successful() && $code === '1') {
                return ['success' => true, 'data' => $data];
            }

            return [
                'success' => false,
                'message' => $message !== '' ? $message : 'Failed to close fiscal day.',
            ];

        } catch (\Exception $e) {
            Log::error('ZIMRA Close Fiscal Day Error', [
                'error' => $e->getMessage(),
            ]);

            return ['success' => false, 'message' => 'Error closing fiscal day: '.$e->getMessage()];
        }
    }

    /**
     * FDMS derives VAT from receipt lines; header tax must match. For tax-inclusive lines with
     * tax_percent set, compute VAT the same way as the fiscal device (see web invoice builder).
     */
    /**
     * Tax-inclusive line amount as ZIMRA validates it: quantity × unit price (signed).
     * Do not derive from line_total_incl alone — stored totals can disagree after rounding,
     * and using line_total_incl with a "<= 0" fallback broke credit notes (negative qty × positive price).
     */
    private function taxInclusiveLineAmountForFiscal(InvoiceLine $line): float
    {
        return round((float) $line->quantity * (float) $line->unit_price, 2);
    }

    private function resolveInvoiceTaxAmountForFiscalization(Invoice $invoice): float
    {
        $invoice->loadMissing(['lines']);

        if ($invoice->tax_inclusive) {
            $sum = 0.0;
            foreach ($invoice->lines as $line) {
                $lineTotal = $this->taxInclusiveLineAmountForFiscal($line);
                $taxPercent = (float) ($line->tax_percent ?? 0);
                if ($taxPercent <= 0) {
                    continue;
                }
                $sum += $lineTotal - ($lineTotal / (1 + $taxPercent / 100));
            }

            return round($sum, 2);
        }

        $fromLines = round((float) $invoice->lines->sum(static fn ($l) => (float) ($l->vat_amount ?? 0)), 2);

        return $fromLines > 0 ? $fromLines : round((float) ($invoice->total_vat ?? 0), 2);
    }

    /**
     * Build the invoice payload for ZIMRA API
     */
    private function buildInvoicePayload(Invoice $invoice): array
    {
        $invoice->load(['lines', 'taxes', 'buyer']);

        $lines = $invoice->lines->values()->map(function ($line, $index) {
            $lineTotal = $this->taxInclusiveLineAmountForFiscal($line);

            return [
                'receiptLineType' => 'Sale',
                'receiptLineNo' => $index + 1,
                'receiptLineHSCode' => (string) ($line->hs_code ?? ''),
                'receiptLineName' => (string) ($line->description ?? 'Item'),
                'receiptLinePrice' => (float) $line->unit_price,
                'receiptLineQuantity' => (float) $line->quantity,
                'receiptLineTotal' => $lineTotal,
                'taxCode' => $line->tax_code ?? 'A',
                'taxPercent' => $line->tax_percent ?? 0,
            ];
        })->toArray();

        return [
            'receiptType' => (string) $invoice->receipt_type,
            'receiptCurrency' => (string) $invoice->receipt_currency,
            'invoiceNo' => (string) $invoice->invoice_no,
            'referenceNumber' => (string) ($invoice->customer_reference ?? ''),
            'invoiceAmount' => (float) $invoice->receipt_total,
            'invoiceTaxAmount' => $this->resolveInvoiceTaxAmountForFiscalization($invoice),
            'receiptNotes' => trim((string) ($invoice->receipt_notes ?? '')) !== ''
                ? (string) $invoice->receipt_notes
                : 'N/A',
            'receiptLinesTaxInclusive' => (bool) $invoice->tax_inclusive,
            'moneyTypeCode' => (string) $invoice->payment_method,
            'receiptPrintForm' => (string) $invoice->receipt_print_form,
            'buyerRegisterName' => (string) ($invoice->buyer->name ?? ''),
            'buyerTradeName' => (string) ($invoice->buyer->name ?? ''),
            'vatNumber' => '',
            'buyerTIN' => (string) ($invoice->buyer->tin ?? ''),
            'buyerPhoneNo' => (string) ($invoice->buyer->phone ?? ''),
            'buyerEmail' => (string) ($invoice->buyer->email ?? ''),
            'buyerProvince' => '',
            'buyerStreet' => (string) ($invoice->buyer->address ?? ''),
            'buyerHouseNo' => '',
            'buyerCity' => '',
            'receiptLines' => $lines,
        ];
    }

    /**
     * Save the fiscal response from ZIMRA
     */
    private function saveFiscalResponse(Invoice $invoice, array $responseData, ?CompanyDevice $device): FiscalResponse
    {
        $data = $responseData['data'] ?? $responseData['Data'] ?? [];
        $receiptNode = is_array($data) ? ($data['receipt'] ?? []) : [];
        $receiptGlobalNo = $data['receiptGlobalNo']
            ?? data_get($data, 'lastReceiptGlobalNo')
            ?? ($receiptNode['receiptGlobalNo'] ?? null)
            ?? ($responseData['FDMSInvoiceNo'] ?? null);
        $receiptCounter = $data['receiptCounter']
            ?? ($receiptNode['receiptCounter'] ?? null)
            ?? 0;
        $receiptId = $data['receiptId']
            ?? ($receiptNode['receiptGlobalNo'] ?? null)
            ?? ($responseData['FDMSInvoiceNo'] ?? null)
            ?? 0;
        $fiscalDayNo = $data['fiscalDayNo']
            ?? $responseData['FiscalDayNo']
            ?? ($receiptNode['fiscalDayNo'] ?? null)
            ?? 0;
        $fdmsInvoiceNo = $data['fdmsInvoiceNo'] ?? $responseData['FDMSInvoiceNo'] ?? '';

        $storedDeviceId = $device?->id
            ?? (string) ($responseData['DeviceID'] ?? data_get($data, 'DeviceID') ?? '');

        return FiscalResponse::create([
            'invoice_id' => $invoice->id,
            'qr_code_url' => (string) ($data['qrCodeUrl'] ?? $responseData['QRCode'] ?? ''),
            'verification_code' => (string) ($data['verificationCode'] ?? $responseData['VerificationCode'] ?? ''),
            'verification_link' => (string) ($data['verificationLink'] ?? $responseData['VerificationLink'] ?? ''),
            'fiscal_day_no' => is_numeric($fiscalDayNo)
                ? (int) $fiscalDayNo
                : 0,
            'receipt_global_no' => is_numeric($receiptGlobalNo)
                ? (int) $receiptGlobalNo
                : 0,
            'receipt_counter' => is_numeric($receiptCounter)
                ? (int) $receiptCounter
                : 0,
            'receipt_id' => is_numeric($receiptId)
                ? (int) $receiptId
                : 0,
            'device_id' => $storedDeviceId,
            'fdms_invoice_no' => (string) $fdmsInvoiceNo,
            'api_response_code' => is_numeric($responseData['code'] ?? $responseData['Code'] ?? null)
                ? (int) ($responseData['code'] ?? $responseData['Code'])
                : 0,
            'api_response_message' => (string) ($responseData['message'] ?? $responseData['Message'] ?? ''),
            'raw_response' => $responseData,
            'submitted_at' => now(),
        ]);
    }

    /**
     * Get fiscal day status for a device
     */
    public function getFiscalDayStatus(CompanyDevice $device): array
    {
        try {
            Log::info('ZIMRA fiscal day status request', [
                'url' => "{$this->baseUrl}/api/fiscal/day/status",
                'query' => ['deviceId' => $device->fiscal_device_id],
            ]);
            $response = Http::timeout($this->timeout)
                ->get("{$this->baseUrl}/api/fiscal/day/status", [
                    'deviceId' => $device->fiscal_device_id,
                ]);

            $data = $response->json();
            Log::info('ZIMRA fiscal day status response', [
                'url' => "{$this->baseUrl}/api/fiscal/day/status",
                'status' => $response->status(),
                'response' => $data,
            ]);

            if ($response->successful()) {
                return [
                    'success' => true,
                    'status' => $data['data']['status'] ?? 'UNKNOWN',
                    'data' => $data,
                ];
            }

            return ['success' => false, 'message' => 'Failed to get fiscal day status'];

        } catch (\Exception $e) {
            Log::error('ZIMRA Fiscal Day Status Error', [
                'device_id' => $device->id,
                'error' => $e->getMessage(),
            ]);

            return ['success' => false, 'message' => $e->getMessage()];
        }
    }
}
