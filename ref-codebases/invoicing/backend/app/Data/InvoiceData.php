<?php

namespace App\Data;

use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
class InvoiceData extends Data
{
    public function __construct(
        public string $invoiceNo,
        public string $receiptType,
        public string $receiptPrintForm,
        public string $receiptCurrency = 'ZWG',
        public bool $taxInclusive = true,
        public float $receiptTotal,
        public ?float $totalExclTax = null,
        public float $totalVat = 0,
        public ?string $receiptNotes = null,
        public ?string $customerReference = null,
        public string $paymentMethod,
        public float $paymentAmount,
        public ?string $refInvoiceId = null,
        public ?string $refInvoiceNo = null,
        public ?\DateTime $refInvoiceDate = null,
        public ?string $refCustomerReference = null,
        public ?string $refDeviceSerial = null,
    ) {}

    /** @return array<string, array<int, string>> */
    public static function validationRules(): array
    {
        return [
            'device_id' => ['nullable', 'uuid'],
            'buyer_id' => ['nullable', 'uuid'],
            'created_by_user_id' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'string', 'in:DRAFT,SUBMITTED,QUEUED,FAILED,CANCELLED'],
            'lines' => ['nullable', 'array'],
            'taxes' => ['nullable', 'array'],
            'invoice_no' => ['required', 'string', 'max:100'],
            'receipt_type' => ['required', 'string', 'in:FiscalInvoice,CreditNote,DebitNote'],
            'receipt_print_form' => ['required', 'string', 'in:InvoiceA4,Receipt48'],
            'receipt_currency' => ['string', 'max:10'],
            'receipt_date' => ['required', 'date'],
            'tax_inclusive' => ['boolean'],
            'receipt_total' => ['required', 'numeric'],
            'total_excl_tax' => ['nullable', 'numeric'],
            'total_vat' => ['numeric'],
            'receipt_notes' => ['nullable', 'string'],
            'customer_reference' => ['nullable', 'string', 'max:255'],
            'payment_method' => ['required', 'string', 'in:CASH,CARD,TRANSFER,CHEQUE,OTHER'],
            'payment_amount' => ['required', 'numeric'],
            'ref_invoice_id' => ['nullable', 'uuid'],
            'ref_invoice_no' => ['nullable', 'string', 'max:100'],
            'ref_invoice_date' => ['nullable', 'date'],
            'ref_customer_reference' => ['nullable', 'string', 'max:255'],
            'ref_device_serial' => ['nullable', 'string', 'max:100'],
        ];
    }

    /** @return array<string, array<int, string>> */
    public static function validationRulesForUpdate(): array
    {
        return array_map(fn (array $rules) => ['sometimes', ...array_diff($rules, ['required'])], self::validationRules());
    }
}
