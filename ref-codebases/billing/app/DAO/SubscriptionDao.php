<?php

declare(strict_types=1);

namespace App\DAO;

use App\DAO\Interfaces\SubscriptionDaoInterface;
use App\Models\Subscription;
use Illuminate\Support\Collection;

/**
 * Tenant: queries use Subscription; a team global scope is registered in booted() when the authenticated user has a non-empty team_id (via data_get, no concrete User type required).
 */
final class SubscriptionDao implements SubscriptionDaoInterface
{
    public function __construct(
        private readonly Subscription $subscription
    ) {}

    public function all(): Collection
    {
        return $this->subscription->newQuery()->with([
            'customer',
            'plan.product',
        ])->get();
    }

    public function find(int $id): ?Subscription
    {
        return $this->subscription->newQuery()->with([
            'customer',
            'plan.product',
        ])->find($id);
    }

    public function create(array $attributes): Subscription
    {
        $teamId = data_get(auth()->user(), 'team_id');
        if ($teamId === null || $teamId === '') {
            $teamId = request()->attributes->get('tenant_id');
        }
        if ($teamId !== null && $teamId !== '') {
            $attributes['team_id'] ??= $teamId;
        }

        return $this->subscription->newQuery()->create($attributes);
    }

    public function update(Subscription $model, array $attributes): bool
    {
        return $model->update($attributes);
    }

    public function delete(Subscription $model): bool
    {
        return (bool) $model->delete();
    }

    public function byCustomer(int $customerId): Collection
    {
        return $this->subscription->newQuery()
            ->with(['customer', 'plan.product'])
            ->where('customer_id', $customerId)
            ->orderByDesc('created_at')
            ->get();
    }
}
