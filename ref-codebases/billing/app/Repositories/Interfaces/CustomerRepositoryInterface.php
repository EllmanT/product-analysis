<?php

declare(strict_types=1);

namespace App\Repositories\Interfaces;

use App\Models\Customer;
use Illuminate\Support\Collection;

interface CustomerRepositoryInterface
{
    /**
     * @return Collection<int, Customer>
     */
    public function all(): Collection;

    public function find(int $id): ?Customer;

    public function create(array $attributes): Customer;

    public function update(Customer $model, array $attributes): bool;

    public function delete(Customer $model): bool;
}
