<?php

declare(strict_types=1);

namespace App\Repositories;

use App\DAO\Interfaces\ExchangeRateDaoInterface;
use App\Models\ExchangeRate;
use App\Repositories\Interfaces\ExchangeRateRepositoryInterface;
use Illuminate\Support\Collection;

final class ExchangeRateRepository implements ExchangeRateRepositoryInterface
{
    public function __construct(
        private readonly ExchangeRateDaoInterface $dao,
    ) {}

    public function all(): Collection
    {
        return $this->dao->all();
    }

    public function currentRate(string $currency): ?ExchangeRate
    {
        return $this->dao->currentRate($currency);
    }

    public function create(array $attributes): ExchangeRate
    {
        return $this->dao->create($attributes);
    }

    public function delete(ExchangeRate $model): bool
    {
        return $this->dao->delete($model);
    }
}
