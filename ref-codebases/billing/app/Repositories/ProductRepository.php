<?php

declare(strict_types=1);

namespace App\Repositories;

use App\DAO\Interfaces\ProductDaoInterface;
use App\Models\Product;
use App\Repositories\Interfaces\ProductRepositoryInterface;
use Illuminate\Support\Collection;

/**
 * Tenant: queries use Product; a team global scope is registered in booted() when the authenticated user has a non-empty team_id (via data_get, no concrete User type required).
 */
final class ProductRepository implements ProductRepositoryInterface
{
    public function __construct(
        private readonly ProductDaoInterface $dao
    ) {}

    public function all(): Collection
    {
        return $this->dao->all();
    }

    public function find(int $id): ?Product
    {
        return $this->dao->find($id);
    }

    public function create(array $attributes): Product
    {
        return $this->dao->create($attributes);
    }

    public function update(Product $model, array $attributes): bool
    {
        return $this->dao->update($model, $attributes);
    }

    public function delete(Product $model): bool
    {
        return $this->dao->delete($model);
    }
}
