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
final class StorePlanData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        public readonly int $product_id,
        public readonly string $name,
        public readonly string $billing_interval,
        public readonly string $price,
        public readonly string $currency,
        public readonly ?int $trial_days = null,
        /** @var list<string> */
        public readonly array $payment_platforms = [],
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'product_id' => ApiValidationRules::productId(),
            'name' => ['required', 'string', 'max:255'],
            'billing_interval' => ['required', 'string', Rule::exists('billing_interval_configs', 'value')->where('team_id', auth()->user()?->team_id)],
            'price' => BillingValidationRules::moneyAmount(),
            'currency' => BillingValidationRules::currencyCode(),
            'trial_days' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:365'],
            'payment_platforms' => ['sometimes', 'array'],
            'payment_platforms.*' => ['string', Rule::in(['ecocash', 'omari', 'zimswitch'])],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toRepositoryArray(): array
    {
        return [
            'product_id' => $this->product_id,
            'name' => $this->name,
            'billing_interval' => $this->billing_interval,
            'price' => $this->price,
            'currency' => strtoupper($this->currency),
            'trial_days' => $this->trial_days,
            'payment_platforms' => empty($this->payment_platforms)
                ? ['ecocash', 'omari', 'zimswitch']
                : $this->payment_platforms,
        ];
    }
}
