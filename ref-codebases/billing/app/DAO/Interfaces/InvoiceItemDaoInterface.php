<?php

declare(strict_types=1);

namespace App\DAO\Interfaces;

use App\Models\InvoiceItem;
use Illuminate\Support\Collection;

interface InvoiceItemDaoInterface
{
    /**
     * @return Collection<int, InvoiceItem>
     */
    public function all(): Collection;

    public function find(int $id): ?InvoiceItem;

    public function create(array $attributes): InvoiceItem;

    public function update(InvoiceItem $model, array $attributes): bool;

    public function delete(InvoiceItem $model): bool;
}
