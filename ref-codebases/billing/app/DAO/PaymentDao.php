<?php

declare(strict_types=1);

namespace App\DAO;

use App\DAO\Interfaces\PaymentDaoInterface;
use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Support\Collection;

/**
 * Tenant: queries use Payment; a team global scope is registered in booted() when the authenticated user has a non-empty team_id (via data_get, no concrete User type required).
 */
final class PaymentDao implements PaymentDaoInterface
{
    public function __construct(
        private readonly Payment $payment
    ) {}

    public function all(): Collection
    {
        return $this->payment->newQuery()->with([
            'invoice.customer',
            'invoice.subscription.customer',
            'invoice.subscription.plan.product',
        ])->get();
    }

    public function find(int $id): ?Payment
    {
        return $this->payment->newQuery()->with([
            'invoice.customer',
            'invoice.subscription.customer',
            'invoice.subscription.plan.product',
        ])->find($id);
    }

    public function create(array $attributes): Payment
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

        return $this->payment->newQuery()->create($attributes);
    }

    public function update(Payment $model, array $attributes): bool
    {
        if (isset($attributes['invoice_id'])) {
            $invoice = Invoice::query()->find($attributes['invoice_id']);
            if ($invoice !== null) {
                $attributes['team_id'] = $invoice->team_id;
            }
        }

        return $model->update($attributes);
    }

    public function delete(Payment $model): bool
    {
        return (bool) $model->delete();
    }
}
