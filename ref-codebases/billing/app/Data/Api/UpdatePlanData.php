<?php

declare(strict_types=1);

namespace App\Data\Api;

use App\Data\Concerns\FromValidatedRequest;
use App\Support\ApiValidationRules;
use App\Support\BillingValidationRules;
use Illuminate\Validation\Rule;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class UpdatePlanData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        public readonly ?int $product_id = null,
        public readonly ?string $name = null,
        public readonly ?string $billing_interval = null,
        public readonly ?string $price = null,
        public readonly ?string $currency = null,
        public readonly ?int $trial_days = null,
        /** @var list<string>|null */
        public readonly ?array $payment_platforms = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'product_id' => array_merge(['sometimes'], ApiValidationRules::productId(false)),
            'name' => ['sometimes', 'string', 'max:255'],
            'billing_interval' => ['sometimes', 'string', Rule::exists('billing_interval_configs', 'value')->where('team_id', auth()->user()?->team_id)],
            'price' => BillingValidationRules::optionalMoneyAmount(),
            'currency' => BillingValidationRules::currencyCode(false),
            'trial_days' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:365'],
            'payment_platforms' => ['sometimes', 'nullable', 'array'],
            'payment_platforms.*' => ['string', Rule::in(['ecocash', 'omari', 'zimswitch'])],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toPayload(): array
    {
        $payload = array_filter($this->toArray(), fn (mixed $v): bool => $v !== null);
        if (isset($payload['currency'])) {
            $payload['currency'] = strtoupper((string) $payload['currency']);
        }
        // Allow explicitly setting an empty array to clear all platforms (full replacement)
        if ($this->payment_platforms !== null) {
            $payload['payment_platforms'] = $this->payment_platforms;
        }

        return $payload;
    }
}
