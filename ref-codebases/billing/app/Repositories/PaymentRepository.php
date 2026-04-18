<?php

declare(strict_types=1);

namespace App\Repositories;

use App\DAO\Interfaces\PaymentDaoInterface;
use App\Models\Payment;
use App\Repositories\Interfaces\PaymentRepositoryInterface;
use Illuminate\Support\Collection;

/**
 * Tenant: queries use Payment; a team global scope is registered in booted() when the authenticated user has a non-empty team_id (via data_get, no concrete User type required).
 */
final class PaymentRepository implements PaymentRepositoryInterface
{
    public function __construct(
        private readonly PaymentDaoInterface $dao
    ) {}

    public function all(): Collection
    {
        return $this->dao->all();
    }

    public function find(int $id): ?Payment
    {
        return $this->dao->find($id);
    }

    public function create(array $attributes): Payment
    {
        return $this->dao->create($attributes);
    }

    public function update(Payment $model, array $attributes): bool
    {
        return $this->dao->update($model, $attributes);
    }

    public function delete(Payment $model): bool
    {
        return $this->dao->delete($model);
    }
}
