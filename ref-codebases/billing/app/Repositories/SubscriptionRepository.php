<?php

declare(strict_types=1);

namespace App\Repositories;

use App\DAO\Interfaces\SubscriptionDaoInterface;
use App\Models\Subscription;
use App\Repositories\Interfaces\SubscriptionRepositoryInterface;
use Illuminate\Support\Collection;

/**
 * Tenant: queries use Subscription; a team global scope is registered in booted() when the authenticated user has a non-empty team_id (via data_get, no concrete User type required).
 */
final class SubscriptionRepository implements SubscriptionRepositoryInterface
{
    public function __construct(
        private readonly SubscriptionDaoInterface $dao
    ) {}

    public function all(): Collection
    {
        return $this->dao->all();
    }

    public function find(int $id): ?Subscription
    {
        return $this->dao->find($id);
    }

    public function create(array $attributes): Subscription
    {
        return $this->dao->create($attributes);
    }

    public function update(Subscription $model, array $attributes): bool
    {
        return $this->dao->update($model, $attributes);
    }

    public function delete(Subscription $model): bool
    {
        return $this->dao->delete($model);
    }

    public function byCustomer(int $customerId): Collection
    {
        return $this->dao->byCustomer($customerId);
    }
}
