<?php

declare(strict_types=1);

namespace App\Repositories;

use App\DAO\Interfaces\PlanDaoInterface;
use App\Models\Plan;
use App\Repositories\Interfaces\PlanRepositoryInterface;
use Illuminate\Support\Collection;

/**
 * Tenant: queries use Plan; a team global scope is registered in booted() when the authenticated user has a non-empty team_id (via data_get, no concrete User type required).
 */
final class PlanRepository implements PlanRepositoryInterface
{
    public function __construct(
        private readonly PlanDaoInterface $dao
    ) {}

    public function all(): Collection
    {
        return $this->dao->all();
    }

    public function find(int $id): ?Plan
    {
        return $this->dao->find($id);
    }

    public function create(array $attributes): Plan
    {
        return $this->dao->create($attributes);
    }

    public function update(Plan $model, array $attributes): bool
    {
        return $this->dao->update($model, $attributes);
    }

    public function delete(Plan $model): bool
    {
        return $this->dao->delete($model);
    }
}
