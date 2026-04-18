<?php

declare(strict_types=1);

namespace App\DAO\Interfaces;

use App\Models\Invoice;
use Illuminate\Support\Collection;

interface InvoiceDaoInterface
{
    /**
     * @return Collection<int, Invoice>
     */
    public function all(): Collection;

    public function find(int $id): ?Invoice;

    public function create(array $attributes): Invoice;

    public function update(Invoice $model, array $attributes): bool;

    public function delete(Invoice $model): bool;

    /**
     * Open invoices ordered by due_date ascending (for payment form selects).
     *
     * @return Collection<int, Invoice>
     */
    public function openOrdered(): Collection;
}
