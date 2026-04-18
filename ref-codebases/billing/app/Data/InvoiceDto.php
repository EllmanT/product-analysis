<?php

declare(strict_types=1);

namespace App\Data;

use App\Enums\InvoiceStatus;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class InvoiceDto extends Data
{
    public function __construct(
        public readonly ?int $id,
        public readonly ?int $team_id,
        public readonly int $customer_id,
        public readonly ?int $subscription_id,
        public readonly string $amount,
        public readonly string $currency,
        public readonly InvoiceStatus $status,
        public readonly string $due_date,
        public readonly ?CustomerDto $customer = null,
        public readonly ?SubscriptionDto $subscription = null,
    ) {}
}
