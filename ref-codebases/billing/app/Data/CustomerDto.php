<?php

declare(strict_types=1);

namespace App\Data;

use App\Models\Customer;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class CustomerDto extends Data
{
    public function __construct(
        public readonly ?int $id,
        public readonly ?int $team_id,
        public readonly string $name,
        public readonly ?string $email,
        /** @var list<array{id: int, plan_id: int}> */
        public readonly array $subscriptions = [],
    ) {}

    public static function fromCustomer(Customer $customer): self
    {
        $customer->loadMissing('subscriptions');

        return new self(
            id: $customer->id,
            team_id: $customer->team_id,
            name: $customer->name,
            email: $customer->email,
            subscriptions: $customer->subscriptions->map(fn ($s): array => [
                'id' => $s->id,
                'plan_id' => $s->plan_id,
            ])->values()->all(),
        );
    }
}
