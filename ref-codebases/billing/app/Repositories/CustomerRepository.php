<?php

declare(strict_types=1);

namespace App\Repositories;

use App\DAO\Interfaces\CustomerDaoInterface;
use App\Models\Customer;
use App\Repositories\Interfaces\CustomerRepositoryInterface;
use Illuminate\Support\Collection;

/**
 * Tenant: queries use Customer; a team global scope is registered in booted() when the authenticated user has a non-empty team_id (via data_get, no concrete User type required).
 */
final class CustomerRepository implements CustomerRepositoryInterface
{
    public function __construct(
        private readonly CustomerDaoInterface $dao
    ) {}

    public function all(): Collection
    {
        return $this->dao->all();
    }

    public function find(int $id): ?Customer
    {
        return $this->dao->find($id);
    }

    public function create(array $attributes): Customer
    {
        return $this->dao->create($attributes);
    }

    public function update(Customer $model, array $attributes): bool
    {
        return $this->dao->update($model, $attributes);
    }

    public function delete(Customer $model): bool
    {
        return $this->dao->delete($model);
    }
}
