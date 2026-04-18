<?php

declare(strict_types=1);

namespace App\Repositories\Interfaces;

use App\Models\Product;
use Illuminate\Support\Collection;

interface ProductRepositoryInterface
{
    /**
     * @return Collection<int, Product>
     */
    public function all(): Collection;

    public function find(int $id): ?Product;

    public function create(array $attributes): Product;

    public function update(Product $model, array $attributes): bool;

    public function delete(Product $model): bool;
}
