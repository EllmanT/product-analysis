<?php

declare(strict_types=1);

namespace App\Data;

use App\Enums\SubscriptionStatus;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class SubscriptionDto extends Data
{
    public function __construct(
        public readonly ?int $id,
        public readonly ?int $team_id,
        public readonly int $customer_id,
        public readonly int $plan_id,
        public readonly SubscriptionStatus $status,
        public readonly string $start_date,
        public readonly ?string $end_date,
        public readonly ?string $trial_end,
        public readonly ?CustomerDto $customer = null,
        public readonly ?PlanDto $plan = null,
        /** Payment platform used for this subscription, e.g. 'ecocash' */
        public readonly ?string $payment_platform = null,
    ) {}
}
