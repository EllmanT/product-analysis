<?php

declare(strict_types=1);

namespace App\Data;

use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class PlanDto extends Data
{
    public function __construct(
        public readonly ?int $id,
        public readonly ?int $team_id,
        public readonly int $product_id,
        public readonly string $name,
        public readonly string $billing_interval,
        public readonly string $price,
        public readonly string $currency,
        public readonly ?int $trial_days = null,
        public readonly ?ProductDto $product = null,
        /** Map of currency code → price in that currency, e.g. ['USD' => '100.00', 'ZWG' => '1350.00'] */
        public readonly array $prices = [],
        /** Accepted payment platforms for this plan, e.g. ['ecocash', 'zimswitch'] */
        public readonly array $payment_platforms = [],
    ) {}
}
