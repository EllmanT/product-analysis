<?php

declare(strict_types=1);

namespace App\DAO\Interfaces;

use App\Models\Payment;
use Illuminate\Support\Collection;

interface PaymentDaoInterface
{
    /**
     * @return Collection<int, Payment>
     */
    public function all(): Collection;

    public function find(int $id): ?Payment;

    public function create(array $attributes): Payment;

    public function update(Payment $model, array $attributes): bool;

    public function delete(Payment $model): bool;
}
