<?php

declare(strict_types=1);

namespace App\Repositories\Interfaces;

use App\Models\ExchangeRate;
use Illuminate\Support\Collection;

interface ExchangeRateRepositoryInterface
{
    /** @return Collection<int, ExchangeRate> */
    public function all(): Collection;

    public function currentRate(string $currency): ?ExchangeRate;

    public function create(array $attributes): ExchangeRate;

    public function delete(ExchangeRate $model): bool;
}
