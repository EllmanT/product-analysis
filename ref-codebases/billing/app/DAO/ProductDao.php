<?php

declare(strict_types=1);

namespace App\DAO;

use App\DAO\Interfaces\ProductDaoInterface;
use App\Models\Product;
use Illuminate\Support\Collection;

/**
 * Tenant: queries use Product; a team global scope is registered in booted() when the authenticated user has a non-empty team_id (via data_get, no concrete User type required).
 */
final class ProductDao implements ProductDaoInterface
{
    public function __construct(
        private readonly Product $product
    ) {}

    public function all(): Collection
    {
        return $this->product->newQuery()->get();
    }

    public function find(int $id): ?Product
    {
        return $this->product->newQuery()->find($id);
    }

    public function create(array $attributes): Product
    {
        $teamId = data_get(auth()->user(), 'team_id');
        if ($teamId !== null && $teamId !== '') {
            $attributes['team_id'] ??= $teamId;
        }

        return $this->product->newQuery()->create($attributes);
    }

    public function update(Product $model, array $attributes): bool
    {
        return $model->update($attributes);
    }

    public function delete(Product $model): bool
    {
        return (bool) $model->delete();
    }
}
