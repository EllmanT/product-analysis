<?php

declare(strict_types=1);

namespace App\Data;

use App\Data\Concerns\FromValidatedRequest;
use App\Support\ApiValidationRules;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class CreateCheckoutSessionInputData extends Data
{
    use FromValidatedRequest;

    /**
     * @param  array{name: string, email?: string|null}|null  $customer
     * @param  array<string, mixed>|null  $metadata
     */
    public function __construct(
        public readonly int $plan_id,
        public readonly string $callback_url,
        public readonly ?string $external_reference = null,
        public readonly ?int $customer_id = null,
        public readonly ?array $customer = null,
        public readonly ?array $metadata = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'plan_id' => ApiValidationRules::planId(),
            'callback_url' => ['required', 'url', 'max:2048'],
            'external_reference' => ['nullable', 'string', 'max:255'],

            'customer_id' => array_merge(
                ['nullable', 'prohibits:customer', 'required_without:customer'],
                ApiValidationRules::customerId(false),
            ),
            'customer' => ['nullable', 'array', 'prohibits:customer_id', 'required_without:customer_id'],
            'customer.name' => ['required_with:customer', 'string', 'max:255'],
            'customer.email' => ['nullable', 'string', 'email', 'max:255'],

            'metadata' => ['nullable', 'array'],
            // Stripe-like: allow simple scalar values
            'metadata.*' => ['nullable'],
        ];
    }
}
