<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesTenantCompany;
use App\Http\Requests\StoreInvoiceRequest;
use App\Http\Requests\UpdateInvoiceRequest;
use App\Models\Buyer;
use App\Models\CompanyDevice;
use App\Models\ExternalSubscription;
use App\Models\Invoice;
use App\Repositories\Interfaces\InvoiceRepositoryInterface;
use App\Services\ZimraFiscalService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InvoiceController extends Controller
{
    use ResolvesTenantCompany;

    public function __construct(
        protected InvoiceRepositoryInterface $repository,
        protected ZimraFiscalService $fiscalService
    ) {}

    public function index(Request $request)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $query = Invoice::with(['buyer', 'device', 'lines', 'taxes'])
            ->where('company_id', $company->id);

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('invoice_no', 'like', "%{$search}%")
                    ->orWhere('customer_reference', 'like', "%{$search}%");
            });
        }

        if ($request->has('from_date')) {
            $query->where('receipt_date', '>=', $request->from_date);
        }
        if ($request->has('to_date')) {
            $query->where('receipt_date', '<=', $request->to_date);
        }

        $invoices = $query->latest()->paginate($request->get('per_page', 15));

        return response()->json($invoices);
    }

    public function show(string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $invoice = Invoice::with(['buyer', 'device', 'lines', 'taxes', 'fiscalResponse'])
            ->where('company_id', $company->id)
            ->where('id', $id)
            ->first();

        if (! $invoice) {
            return response()->json(['message' => 'Invoice not found'], 404);
        }

        return response()->json($invoice);
    }

    public function store(StoreInvoiceRequest $request)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        if (! $this->companyHasActiveSubscription($company->axis_billing_customer_id)) {
            return response()->json([
                'message' => 'Active subscription required to create invoices.',
            ], 402);
        }

        $validated = $request->validated();

        if (! empty($validated['device_id'])) {
            $device = CompanyDevice::query()
                ->where('company_id', $company->id)
                ->where('id', $validated['device_id'])
                ->first();
            if ($device === null) {
                return response()->json(['message' => 'Device does not belong to your company.'], 422);
            }
        }

        if (! empty($validated['buyer_id'])) {
            $buyerOk = Buyer::query()
                ->where('company_id', $company->id)
                ->where('id', $validated['buyer_id'])
                ->exists();
            if (! $buyerOk) {
                return response()->json(['message' => 'Buyer does not belong to your company.'], 422);
            }
        }

        $validated['company_id'] = $company->id;
        $validated['created_by_user_id'] = (string) auth()->id();

        $taxInclusive = (bool) ($validated['tax_inclusive'] ?? true);
        $lines = $this->normalizeLines($validated['lines'] ?? [], $taxInclusive);
        $taxes = $this->normalizeTaxes($validated['taxes'] ?? []);
        unset($validated['lines'], $validated['taxes']);

        if (count($lines) > 0) {
            $validated = array_merge($validated, $this->recalculateInvoiceTotalsFromLines($lines));
        }

        $model = DB::transaction(function () use ($validated, $lines, $taxes) {
            /** @var Invoice $invoice */
            $invoice = $this->repository->create($validated);

            if (is_array($lines) && count($lines) > 0) {
                $invoice->lines()->createMany($lines);
            }

            if (is_array($taxes) && count($taxes) > 0) {
                $invoice->taxes()->createMany($taxes);
            }

            return $invoice;
        });

        return response()->json($model->fresh(['lines', 'taxes']), 201);
    }

    private function companyHasActiveSubscription(?int $axisBillingCustomerId): bool
    {
        if ($axisBillingCustomerId === null) {
            return false;
        }

        return ExternalSubscription::query()
            ->where('customer_id', $axisBillingCustomerId)
            ->where('status', 'active')
            ->exists();
    }

    public function update(UpdateInvoiceRequest $request, string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $invoice = Invoice::query()
            ->where('company_id', $company->id)
            ->where('id', $id)
            ->first();

        if (! $invoice) {
            return response()->json(['message' => 'Invoice not found'], 404);
        }

        $validated = $request->validated();
        if (isset($validated['device_id'])) {
            $deviceOk = CompanyDevice::query()
                ->where('company_id', $company->id)
                ->where('id', $validated['device_id'])
                ->exists();
            if (! $deviceOk) {
                return response()->json(['message' => 'Device does not belong to your company.'], 422);
            }
        }
        if (array_key_exists('buyer_id', $validated) && $validated['buyer_id'] !== null) {
            $buyerOk = Buyer::query()
                ->where('company_id', $company->id)
                ->where('id', $validated['buyer_id'])
                ->exists();
            if (! $buyerOk) {
                return response()->json(['message' => 'Buyer does not belong to your company.'], 422);
            }
        }

        $linesProvided = array_key_exists('lines', $validated);
        $taxesProvided = array_key_exists('taxes', $validated);
        $taxInclusiveForLines = array_key_exists('tax_inclusive', $validated)
            ? (bool) $validated['tax_inclusive']
            : (bool) $invoice->tax_inclusive;
        $lines = $this->normalizeLines($validated['lines'] ?? [], $taxInclusiveForLines);
        $taxes = $this->normalizeTaxes($validated['taxes'] ?? []);
        unset($validated['lines'], $validated['taxes']);

        if ($linesProvided && count($lines) > 0) {
            $validated = array_merge($validated, $this->recalculateInvoiceTotalsFromLines($lines));
        }

        $model = DB::transaction(function () use ($id, $validated, $invoice, $linesProvided, $taxesProvided, $lines, $taxes) {
            /** @var Invoice $updated */
            $updated = $this->repository->update($id, $validated);

            if ($linesProvided) {
                $invoice->lines()->delete();
                if (is_array($lines) && count($lines) > 0) {
                    $invoice->lines()->createMany($lines);
                }
            }

            if ($taxesProvided) {
                $invoice->taxes()->delete();
                if (is_array($taxes) && count($taxes) > 0) {
                    $invoice->taxes()->createMany($taxes);
                }
            }

            return $updated;
        });

        return response()->json($model->fresh(['lines', 'taxes']));
    }

    public function destroy(string|int $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $invoice = Invoice::query()
            ->where('company_id', $company->id)
            ->where('id', $id)
            ->first();

        if (! $invoice) {
            return response()->json(['message' => 'Invoice not found'], 404);
        }

        if ($invoice->status === 'SUBMITTED') {
            return response()->json([
                'message' => 'Cannot delete a fiscalized invoice',
            ], 422);
        }

        $this->repository->delete($id);

        return response()->json(null, 204);
    }

    public function fiscalize(string $id)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $invoice = Invoice::with(['lines', 'taxes', 'buyer', 'device'])
            ->where('company_id', $company->id)
            ->where('id', $id)
            ->first();

        if (! $invoice) {
            return response()->json(['message' => 'Invoice not found'], 404);
        }

        if ($invoice->status === 'SUBMITTED') {
            return response()->json([
                'message' => 'Invoice already fiscalized',
            ], 422);
        }

        $result = $this->fiscalService->submitFiscalInvoice($invoice);

        if ($result['success']) {
            return response()->json([
                'message' => $result['message'],
                'invoice' => $invoice->fresh(['fiscalResponse']),
                'fiscal_data' => $result['data'] ?? null,
            ]);
        }

        return response()->json([
            'message' => $result['message'],
            'errors' => $result['errors'] ?? null,
        ], 422);
    }

    public function openFiscalDay(Request $request)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $result = $this->fiscalService->openFiscalDay();

        if ($result['success']) {
            return response()->json([
                'message' => 'Fiscal day opened successfully',
                'data' => $result['data'] ?? null,
            ]);
        }

        return response()->json([
            'message' => $result['message'],
        ], 422);
    }

    public function closeFiscalDay(Request $request)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $result = $this->fiscalService->closeFiscalDay();

        if ($result['success']) {
            return response()->json([
                'message' => 'Fiscal day closed successfully',
                'data' => $result['data'] ?? null,
            ]);
        }

        return response()->json([
            'message' => $result['message'],
        ], 422);
    }

    public function fiscalDayStatus(Request $request)
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $status = $this->fiscalService->getVirtualDeviceStatus();

        if (! ($status['success'] ?? false)) {
            return response()->json([
                'message' => $status['message'] ?? 'Unable to get fiscal day status.',
                'code' => $status['code'] ?? null,
                'fiscal_day_status' => $status['fiscal_day_status'] ?? null,
                'data' => $status['data'] ?? null,
            ], 422);
        }

        return response()->json([
            'message' => 'Fiscal day status retrieved.',
            'code' => $status['code'] ?? null,
            'fiscal_day_status' => $status['fiscal_day_status'] ?? null,
            'data' => $status['data'] ?? null,
        ]);
    }

    /**
     * @param  array<int, mixed>  $lines
     * @return array<int, array<string, mixed>>
     */
    private function normalizeLines(mixed $lines, bool $taxInclusive = true): array
    {
        if (! is_array($lines)) {
            return [];
        }

        return collect($lines)
            ->values()
            ->map(function ($line, int $index) use ($taxInclusive) {
                $row = is_array($line) ? $line : [];

                $qty = (float) ($row['quantity'] ?? 0);
                $price = (float) ($row['unit_price'] ?? 0);
                $taxPercent = (float) ($row['tax_percent'] ?? 0);
                $vatAmount = (float) ($row['tax_amount'] ?? $row['vat_amount'] ?? 0);
                $lineTotalIncl = (float) ($row['line_total'] ?? $row['line_total_incl'] ?? ($qty * $price));

                if ($taxInclusive && $taxPercent > 0) {
                    $vatAmount = round($lineTotalIncl - ($lineTotalIncl / (1 + $taxPercent / 100)), 2);
                }

                $lineTotalExcl = (float) ($row['line_total_excl'] ?? 0);
                if ($lineTotalExcl <= 0) {
                    $lineTotalExcl = round(max(0, $lineTotalIncl - $vatAmount), 2);
                }

                $hsRaw = $row['hs_code'] ?? null;
                $hsNorm = is_string($hsRaw) ? trim($hsRaw) : null;

                return [
                    'line_no' => (int) ($row['line_no'] ?? ($index + 1)),
                    'line_type' => (string) ($row['line_type'] ?? 'Sale'),
                    'hs_code' => ($hsNorm !== null && $hsNorm !== '') ? $hsNorm : null,
                    'description' => (string) ($row['description'] ?? ''),
                    'quantity' => $qty,
                    'unit_price' => $price,
                    'tax_code' => (string) ($row['tax_code'] ?? 'A'),
                    'tax_percent' => $taxPercent,
                    'vat_amount' => round($vatAmount, 2),
                    'line_total_excl' => $lineTotalExcl,
                    'line_total_incl' => $lineTotalIncl,
                    'product_id' => $row['product_id'] ?? null,
                ];
            })
            ->all();
    }

    /**
     * @param  array<int, array<string, mixed>>  $lines
     * @return array{total_vat: float, total_excl_tax: float, receipt_total: float, payment_amount: float}
     */
    private function recalculateInvoiceTotalsFromLines(array $lines): array
    {
        $totalVat = 0.0;
        $totalExcl = 0.0;
        $receiptTotal = 0.0;
        foreach ($lines as $line) {
            $totalVat += (float) ($line['vat_amount'] ?? 0);
            $totalExcl += (float) ($line['line_total_excl'] ?? 0);
            $receiptTotal += (float) ($line['line_total_incl'] ?? 0);
        }

        $receiptTotal = round($receiptTotal, 2);

        return [
            'total_vat' => round($totalVat, 2),
            'total_excl_tax' => round($totalExcl, 2),
            'receipt_total' => $receiptTotal,
            'payment_amount' => $receiptTotal,
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function normalizeTaxes(mixed $taxes): array
    {
        if (! is_array($taxes)) {
            return [];
        }

        return collect($taxes)
            ->map(function ($tax) {
                $row = is_array($tax) ? $tax : [];

                return [
                    'tax_code' => (string) ($row['tax_code'] ?? 'A'),
                    'tax_percent' => (float) ($row['tax_percent'] ?? 0),
                    'sales_amount_with_tax' => (float) ($row['sales_amount_with_tax'] ?? $row['sales_amount'] ?? 0),
                    'tax_amount' => (float) ($row['tax_amount'] ?? 0),
                ];
            })
            ->all();
    }
}
