<?php

declare(strict_types=1);

namespace App\DAO;

use App\DAO\Interfaces\PlanDaoInterface;
use App\Models\Plan;
use Illuminate\Support\Collection;

/**
 * Tenant: queries use Plan; a team global scope is registered in booted() when the authenticated user has a non-empty team_id (via data_get, no concrete User type required).
 */
final class PlanDao implements PlanDaoInterface
{
    public function __construct(
        private readonly Plan $plan
    ) {}

    public function all(): Collection
    {
        return $this->plan->newQuery()->with('product')->get();
    }

    public function find(int $id): ?Plan
    {
        return $this->plan->newQuery()->with('product')->find($id);
    }

    public function create(array $attributes): Plan
    {
        $teamId = data_get(auth()->user(), 'team_id');
        if ($teamId !== null && $teamId !== '') {
            $attributes['team_id'] ??= $teamId;
        }

        return $this->plan->newQuery()->create($attributes);
    }

    public function update(Plan $model, array $attributes): bool
    {
        return $model->update($attributes);
    }

    public function delete(Plan $model): bool
    {
        return (bool) $model->delete();
    }
}
