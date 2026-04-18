<?php

declare(strict_types=1);

namespace App\Repositories\Interfaces;

use App\Models\Plan;
use Illuminate\Support\Collection;

interface PlanRepositoryInterface
{
    /**
     * @return Collection<int, Plan>
     */
    public function all(): Collection;

    public function find(int $id): ?Plan;

    public function create(array $attributes): Plan;

    public function update(Plan $model, array $attributes): bool;

    public function delete(Plan $model): bool;
}
