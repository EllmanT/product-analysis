<?php

declare(strict_types=1);

namespace App\Repositories;

use App\DAO\Interfaces\InvoiceItemDaoInterface;
use App\Models\InvoiceItem;
use App\Repositories\Interfaces\InvoiceItemRepositoryInterface;
use Illuminate\Support\Collection;

/**
 * Tenant: queries use InvoiceItem; a team global scope is registered in booted() when the authenticated user has a non-empty team_id (via data_get, no concrete User type required).
 */
final class InvoiceItemRepository implements InvoiceItemRepositoryInterface
{
    public function __construct(
        private readonly InvoiceItemDaoInterface $dao
    ) {}

    public function all(): Collection
    {
        return $this->dao->all();
    }

    public function find(int $id): ?InvoiceItem
    {
        return $this->dao->find($id);
    }

    public function create(array $attributes): InvoiceItem
    {
        return $this->dao->create($attributes);
    }

    public function update(InvoiceItem $model, array $attributes): bool
    {
        return $this->dao->update($model, $attributes);
    }

    public function delete(InvoiceItem $model): bool
    {
        return $this->dao->delete($model);
    }
}
