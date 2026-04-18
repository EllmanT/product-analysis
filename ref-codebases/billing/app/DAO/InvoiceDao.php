<?php

declare(strict_types=1);

namespace App\DAO;

use App\DAO\Interfaces\InvoiceDaoInterface;
use App\Enums\InvoiceStatus;
use App\Models\Invoice;
use Illuminate\Support\Collection;

/**
 * Tenant: queries use Invoice; a team global scope is registered in booted() when the authenticated user has a non-empty team_id (via data_get, no concrete User type required).
 */
final class InvoiceDao implements InvoiceDaoInterface
{
    public function __construct(
        private readonly Invoice $invoice
    ) {}

    public function all(): Collection
    {
        return $this->invoice->newQuery()->with([
            'customer',
            'subscription.customer',
            'subscription.plan.product',
            'invoiceItems',
        ])->get();
    }

    public function find(int $id): ?Invoice
    {
        return $this->invoice->newQuery()->with([
            'customer',
            'subscription.customer',
            'subscription.plan.product',
            'invoiceItems',
        ])->find($id);
    }

    public function create(array $attributes): Invoice
    {
        $teamId = data_get(auth()->user(), 'team_id');
        if ($teamId === null || $teamId === '') {
            $teamId = request()->attributes->get('tenant_id');
        }
        if ($teamId !== null && $teamId !== '') {
            $attributes['team_id'] ??= (int) $teamId;
        }

        return $this->invoice->newQuery()->create($attributes);
    }

    public function update(Invoice $model, array $attributes): bool
    {
        return $model->update($attributes);
    }

    public function delete(Invoice $model): bool
    {
        return (bool) $model->delete();
    }

    public function openOrdered(): Collection
    {
        return $this->invoice->newQuery()
            ->whereIn('status', InvoiceStatus::payable())
            ->orderBy('due_date')
            ->get(['id', 'amount', 'currency', 'due_date', 'customer_id']);
    }
}
