<?php

namespace App\Services;

use App\Models\Company;
use App\Models\CompanyDevice;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoiceTax;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

readonly class SampleFiscalizationService
{
    public function __construct(
        private ProductTemplatePicker $picker,
        private ZimraFiscalService    $zimra,
        private InvoicePdfService     $pdfs,
    ) {}

    /**
     * @return array{invoiceUsdPdf:string,invoiceZwgPdf:string}
     */
    public function generateAndFiscalize(CompanyDevice $device, Company $company): array
    {
        $zimraDeviceId = (string) ($device->zimra_device_id ?? '');
        if ($zimraDeviceId === '') {
            throw new RuntimeException('Missing zimra_device_id on device.');
        }

        $products = array_merge(
            $this->picker->pick('templates/vat-products.json', 1),
            $this->picker->pick('templates/non-vat-products.json', 1),
            $this->picker->pick('templates/ext-vat-products.json', 1),
        );

        // Best effort: ensure fiscal day is open.
        $status = $this->zimra->getVirtualDeviceStatus();
        if (($status['success'] ?? false) && strcasecmp((string) ($status['fiscal_day_status'] ?? ''), 'FiscalDayClosed') === 0) {
            $this->zimra->openFiscalDay();
        }

        $outDir = 'templates/invoices/'.$zimraDeviceId;

        return DB::transaction(function () use ($device, $company, $products, $outDir) {
            $invoice = $this->createInvoiceWithLines(
                $company,
                $device,
                'FiscalInvoice',
                $products,
                null,
                'USD',
            );

            $invoiceResult = $this->zimra->submitFiscalInvoice($invoice);
            if (! ($invoiceResult['success'] ?? false)) {
                throw new RuntimeException('Failed to fiscalize invoice: '.((string) ($invoiceResult['message'] ?? 'unknown error')));
            }

            $invoiceZwg = $this->createInvoiceWithLines(
                $company,
                $device,
                'FiscalInvoice',
                $products,
                null,
                'ZWG',
            );

            $invoiceZwgResult = $this->zimra->submitFiscalInvoice($invoiceZwg);
            if (! ($invoiceZwgResult['success'] ?? false)) {
                throw new RuntimeException('Failed to fiscalize ZWG invoice: '.((string) ($invoiceZwgResult['message'] ?? 'unknown error')));
            }

            /*
            $credit = $this->createInvoiceWithLines(
                $company,
                $device,
                'CreditNote',
                array_slice($products, 0, 3),
                $invoice,
                'USD',
            );
            $creditResult = $this->zimra->submitFiscalInvoice($credit);
            if (! ($creditResult['success'] ?? false)) {
                throw new RuntimeException('Failed to fiscalize USD credit note: '.((string) ($creditResult['message'] ?? 'unknown error')));
            }

            $creditZwg = $this->createInvoiceWithLines(
                $company,
                $device,
                'CreditNote',
                array_slice($products, 0, 3),
                $invoiceZwg,
                'ZWG',
            );
            $creditZwgResult = $this->zimra->submitFiscalInvoice($creditZwg);
            if (! ($creditZwgResult['success'] ?? false)) {
                throw new RuntimeException('Failed to fiscalize ZWG credit note: '.((string) ($creditZwgResult['message'] ?? 'unknown error')));
            }

            $debit = $this->createInvoiceWithLines(
                $company,
                $device,
                'DebitNote',
                array_slice($products, 3, 3),
                $invoice,
                'USD',
            );
            $debitResult = $this->zimra->submitFiscalInvoice($debit);
            if (! ($debitResult['success'] ?? false)) {
                throw new RuntimeException('Failed to fiscalize debit note: '.((string) ($debitResult['message'] ?? 'unknown error')));
            }
            */

            $invoiceUsdPdf = $this->pdfs->renderToStorage($invoice, $outDir, 'usd-receipt.pdf');
            $invoiceZwgPdf = $this->pdfs->renderToStorage($invoiceZwg, $outDir, 'zwg-receipt.pdf');
            /*
            $creditUsdPdf = $this->pdfs->renderToStorage($credit, $outDir, 'usd-credit-note.pdf');
            $creditZwgPdf = $this->pdfs->renderToStorage($creditZwg, $outDir, 'zwg-credit-note.pdf');
            $debitPdf = $this->pdfs->renderToStorage($debit, $outDir, 'debit-note.pdf');
            */

            Log::info('Generated sample fiscal docs', [
                'company_device_id' => $device->id,
                'zimra_device_id' => $device->zimra_device_id,
                'invoice_id' => $invoice->id,
                'invoice_zwg_id' => $invoiceZwg->id,
            ]);

            return [
                'invoiceUsdPdf' => $invoiceUsdPdf,
                'invoiceZwgPdf' => $invoiceZwgPdf,
            ];
        });
    }

    /**
     * @param  array<int, array<string, mixed>>  $products
     */
    private function createInvoiceWithLines(
        Company $company,
        CompanyDevice $device,
        string $receiptType,
        array $products,
        ?Invoice $refInvoice,
        string $currency
    ): Invoice {
        $invoice = Invoice::query()->create([
            'company_id' => $company->id,
            'device_id' => $device->id,
            'buyer_id' => null,
            'created_by_user_id' => 'system',
            'invoice_no' => $this->generateInvoiceNo($receiptType, $currency),
            'receipt_type' => $receiptType,
            'receipt_print_form' => 'InvoiceA4',
            'receipt_currency' => $currency,
            'receipt_date' => now(),
            'tax_inclusive' => true,
            'receipt_total' => 0,
            'total_excl_tax' => 0,
            'total_vat' => 0,
            'receipt_notes' => 'Auto-generated from E-Invoicing',
            'customer_reference' => null,
            'payment_method' => 'CASH',
            'payment_amount' => 0,
            'ref_invoice_id' => $refInvoice?->id,
            'ref_invoice_no' => $refInvoice?->invoice_no,
            'ref_invoice_date' => $refInvoice?->receipt_date,
            'ref_customer_reference' => $refInvoice?->customer_reference,
            'ref_device_serial' => (string) ($device->device_serial_no ?: $device->fiscal_device_id),
            'status' => 'DRAFT',
        ]);

        $totalIncl = 0.0;
        $totalVat = 0.0;
        $taxBuckets = [];

        foreach (array_values($products) as $idx => $p) {
            // ZIMRA validates line totals as Quantity × Unit Price. Negative quantity with a
            // positive unit price can be summed as positive line amounts (e.g. abs(qty)×price).
            // Credit notes: positive quantity, negative unit price so qty × price stays negative.
            $qty = 1.0;
            $unit = (float) ($p['default_unit_price'] ?? 1);
            if ($receiptType === 'CreditNote') {
                $unit = -abs($unit);
            }
            $taxPercent = (float) ($p['tax_percent'] ?? 0);
            $taxCode = (string) ($p['tax_code'] ?? 'B');

            $lineIncl = $qty * $unit;
            $vatAmount = $taxPercent > 0 ? ($lineIncl - ($lineIncl / (1 + $taxPercent / 100))) : 0.0;
            $lineExcl = $lineIncl - $vatAmount;

            InvoiceLine::query()->create([
                'invoice_id' => $invoice->id,
                'line_no' => $idx + 1,
                'line_type' => 'Sale',
                'hs_code' => (string) ($p['hs_code'] ?? ''),
                'description' => (string) ($p['description'] ?? $p['name'] ?? 'Item'),
                'quantity' => $qty,
                'unit_price' => $unit,
                'tax_code' => $taxCode,
                'tax_percent' => $taxPercent,
                'vat_amount' => round($vatAmount, 2),
                'line_total_excl' => round($lineExcl, 2),
                'line_total_incl' => round($lineIncl, 2),
                'product_id' => null,
            ]);

            $totalIncl += $lineIncl;
            $totalVat += $vatAmount;

            $bucketKey = $taxCode.'|'.number_format($taxPercent, 2, '.', '');
            $taxBuckets[$bucketKey] = $taxBuckets[$bucketKey] ?? ['tax_code' => $taxCode, 'tax_percent' => $taxPercent, 'sales' => 0.0, 'tax' => 0.0];
            $taxBuckets[$bucketKey]['sales'] += $lineIncl;
            $taxBuckets[$bucketKey]['tax'] += $vatAmount;
        }

        foreach ($taxBuckets as $b) {
            InvoiceTax::query()->create([
                'invoice_id' => $invoice->id,
                'tax_code' => $b['tax_code'],
                'tax_percent' => $b['tax_percent'],
                'sales_amount_with_tax' => round($b['sales'], 2),
                'tax_amount' => round($b['tax'], 2),
            ]);
        }

        $invoice->forceFill([
            'receipt_total' => round($totalIncl, 2),
            'payment_amount' => round($totalIncl, 2),
            'total_vat' => round($totalVat, 2),
            'total_excl_tax' => round($totalIncl - $totalVat, 2),
        ])->save();

        return $invoice->fresh(['lines', 'taxes', 'device']);
    }

    private function generateInvoiceNo(string $receiptType, string $currency): string
    {
        $prefix = match ($receiptType) {
            'CreditNote' => 'CN',
            'DebitNote' => 'DN',
            default => 'INV',
        };

        return $prefix.'-'.$currency.'-'.now()->format('YmdHis').'-'.Str::upper(Str::random(4));
    }
}
