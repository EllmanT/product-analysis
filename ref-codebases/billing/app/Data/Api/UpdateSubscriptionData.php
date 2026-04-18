<?php

declare(strict_types=1);

namespace App\Data\Api;

use App\Data\Concerns\FromValidatedRequest;
use App\Enums\SubscriptionStatus;
use App\Support\ApiValidationRules;
use Illuminate\Validation\Rule;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class UpdateSubscriptionData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        public readonly ?int $customer_id = null,
        public readonly ?int $plan_id = null,
        public readonly ?SubscriptionStatus $status = null,
        public readonly ?string $start_date = null,
        public readonly ?string $end_date = null,
        public readonly ?string $trial_end = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'customer_id' => array_merge(['sometimes'], ApiValidationRules::customerId(false)),
            'plan_id' => array_merge(['sometimes'], ApiValidationRules::planId(false)),
            'status' => ['sometimes', Rule::enum(SubscriptionStatus::class)],
            'start_date' => ['sometimes', 'date'],
            'end_date' => ['nullable', 'date'],
            'trial_end' => ['nullable', 'date'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toPayload(): array
    {
        return array_filter($this->toArray(), fn (mixed $v): bool => $v !== null);
    }
}
