<?php

declare(strict_types=1);

namespace App\Data;

use App\Data\Concerns\FromValidatedRequest;
use App\Enums\InvoiceStatus;
use Illuminate\Validation\Rule;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class GenerateInvoiceFromSubscriptionInputData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        /** Billing period anchor; defaults to today. */
        public readonly ?string $issue_date = null,
        /** When payment is due; overrides `days_until_due` when set. */
        public readonly ?string $due_date = null,
        /** Used when `due_date` is omitted: issue date + this many days. */
        public readonly int $days_until_due = 14,
        public readonly InvoiceStatus $status = InvoiceStatus::Open,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'issue_date' => ['nullable', 'date'],
            'due_date' => ['nullable', 'date'],
            'days_until_due' => ['nullable', 'integer', 'min:1', 'max:365'],
            'status' => ['nullable', Rule::enum(InvoiceStatus::class)],
        ];
    }
}
