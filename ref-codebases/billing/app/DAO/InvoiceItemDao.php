<?php

declare(strict_types=1);

namespace App\DAO;

use App\DAO\Interfaces\InvoiceItemDaoInterface;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use Illuminate\Support\Collection;

/**
 * Tenant: queries use InvoiceItem; a team global scope is registered in booted() when the authenticated user has a non-empty team_id (via data_get, no concrete User type required).
 */
final class InvoiceItemDao implements InvoiceItemDaoInterface
{
    public function __construct(
        private readonly InvoiceItem $invoiceItem
    ) {}

    public function all(): Collection
    {
        return $this->invoiceItem->newQuery()->with([
            'invoice.customer',
            'invoice.subscription.plan.product',
        ])->get();
    }

    public function find(int $id): ?InvoiceItem
    {
        return $this->invoiceItem->newQuery()->with([
            'invoice.customer',
            'invoice.subscription.plan.product',
        ])->find($id);
    }

    public function create(array $attributes): InvoiceItem
    {
        if (isset($attributes['invoice_id'])) {
            $invoice = Invoice::query()->find($attributes['invoice_id']);
            if ($invoice !== null) {
                $attributes['team_id'] = $invoice->team_id;
            }
        }

        $teamId = data_get(auth()->user(), 'team_id');
        if (($attributes['team_id'] ?? null) === null && $teamId !== null && $teamId !== '') {
            $attributes['team_id'] = $teamId;
        }

        return $this->invoiceItem->newQuery()->create($attributes);
    }

    public function update(InvoiceItem $model, array $attributes): bool
    {
        return $model->update($attributes);
    }

    public function delete(InvoiceItem $model): bool
    {
        return (bool) $model->delete();
    }
}
