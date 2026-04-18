<?php

declare(strict_types=1);

namespace App\Data;

use App\Data\Concerns\FromValidatedRequest;
use App\Support\ApiValidationRules;
use Illuminate\Validation\Rule;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class CreateSubscriptionInputData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        public readonly ?int $customer_id,
        /** @var array{name: string, email?: string|null}|null */
        public readonly ?array $customer,
        public readonly int $plan_id,
        public readonly string $start_date,
        public readonly ?string $end_date = null,
        public readonly ?string $trial_end = null,
        public readonly ?string $payment_platform = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'customer_id' => array_merge(
                ['nullable', 'prohibits:customer', 'required_without:customer'],
                ApiValidationRules::customerId(false),
            ),
            'customer' => ['nullable', 'array', 'prohibits:customer_id', 'required_without:customer_id'],
            'customer.name' => ['required_with:customer', 'string', 'max:255'],
            'customer.email' => ['nullable', 'string', 'email', 'max:255'],
            'plan_id' => ApiValidationRules::planId(),
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'trial_end' => ['nullable', 'date'],
            'payment_platform' => ['nullable', 'string', Rule::in(['ecocash', 'omari', 'zimswitch', 'free'])],
        ];
    }
}
