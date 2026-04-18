<?php

declare(strict_types=1);

namespace App\DAO\Interfaces;

use App\Models\Subscription;
use Illuminate\Support\Collection;

interface SubscriptionDaoInterface
{
    /**
     * @return Collection<int, Subscription>
     */
    public function all(): Collection;

    public function find(int $id): ?Subscription;

    public function create(array $attributes): Subscription;

    public function update(Subscription $model, array $attributes): bool;

    public function delete(Subscription $model): bool;

    /**
     * @return Collection<int, Subscription>
     */
    public function byCustomer(int $customerId): Collection;
}
