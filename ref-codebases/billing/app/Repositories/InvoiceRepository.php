<?php

declare(strict_types=1);

namespace App\Repositories;

use App\DAO\Interfaces\InvoiceDaoInterface;
use App\Models\Invoice;
use App\Repositories\Interfaces\InvoiceRepositoryInterface;
use Illuminate\Support\Collection;

/**
 * Tenant: queries use Invoice; a team global scope is registered in booted() when the authenticated user has a non-empty team_id (via data_get, no concrete User type required).
 */
final class InvoiceRepository implements InvoiceRepositoryInterface
{
    public function __construct(
        private readonly InvoiceDaoInterface $dao
    ) {}

    public function all(): Collection
    {
        return $this->dao->all();
    }

    public function find(int $id): ?Invoice
    {
        return $this->dao->find($id);
    }

    public function create(array $attributes): Invoice
    {
        return $this->dao->create($attributes);
    }

    public function update(Invoice $model, array $attributes): bool
    {
        return $this->dao->update($model, $attributes);
    }

    public function delete(Invoice $model): bool
    {
        return $this->dao->delete($model);
    }

    public function openOrdered(): Collection
    {
        return $this->dao->openOrdered();
    }
}
