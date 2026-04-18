<?php

declare(strict_types=1);

namespace App\DAO;

use App\DAO\Interfaces\CustomerDaoInterface;
use App\Models\Customer;
use Illuminate\Support\Collection;

/**
 * Tenant: queries use Customer; a team global scope is registered in booted() when the authenticated user has a non-empty team_id (via data_get, no concrete User type required).
 */
final class CustomerDao implements CustomerDaoInterface
{
    public function __construct(
        private readonly Customer $customer
    ) {}

    public function all(): Collection
    {
        return $this->customer->newQuery()->with('subscriptions')->get();
    }

    public function find(int $id): ?Customer
    {
        return $this->customer->newQuery()->with('subscriptions')->find($id);
    }

    public function create(array $attributes): Customer
    {
        $teamId = data_get(auth()->user(), 'team_id');
        if ($teamId === null || $teamId === '') {
            $teamId = request()->attributes->get('tenant_id');
        }
        if ($teamId !== null && $teamId !== '') {
            $attributes['team_id'] ??= $teamId;
        }

        return $this->customer->newQuery()->create($attributes);
    }

    public function update(Customer $model, array $attributes): bool
    {
        return $model->update($attributes);
    }

    public function delete(Customer $model): bool
    {
        return (bool) $model->delete();
    }
}
