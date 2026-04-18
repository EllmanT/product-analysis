<?php

namespace App\Data;

use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
class FiscalResponseData extends Data
{
    public function __construct(
        public string $invoiceId,
        public string $qrCodeUrl,
        public string $verificationCode,
        public string $verificationLink,
        public int $fiscalDayNo,
        public int $receiptGlobalNo,
        public int $receiptCounter,
        public int $receiptId,
        public string $deviceId,
        public ?string $fdmsInvoiceNo = null,
        public ?string $apiResponseCode = null,
        public ?string $apiResponseMessage = null,
        public ?array $rawResponse = null,
        public ?\DateTime $submittedAt = null,
    ) {}

    /** @return array<string, array<int, string>> */
    public static function validationRules(): array
    {
        return [
            'invoice_id' => ['required', 'uuid'],
            'qr_code_url' => ['required', 'string'],
            'verification_code' => ['required', 'string', 'max:50'],
            'verification_link' => ['required', 'string', 'max:500'],
            'fiscal_day_no' => ['required', 'integer'],
            'receipt_global_no' => ['required', 'integer'],
            'receipt_counter' => ['required', 'integer'],
            'receipt_id' => ['required', 'integer'],
            'device_id' => ['required', 'string', 'max:50'],
            'fdms_invoice_no' => ['nullable', 'string', 'max:100'],
            'api_response_code' => ['nullable', 'string', 'max:10'],
            'api_response_message' => ['nullable', 'string', 'max:255'],
            'raw_response' => ['nullable', 'array'],
            'submitted_at' => ['nullable', 'date'],
        ];
    }

    /** @return array<string, array<int, string>> */
    public static function validationRulesForUpdate(): array
    {
        return array_map(fn (array $rules) => ['sometimes', ...array_diff($rules, ['required'])], self::validationRules());
    }
}
