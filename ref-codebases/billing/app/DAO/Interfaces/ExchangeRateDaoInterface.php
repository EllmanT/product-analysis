<?php

declare(strict_types=1);

namespace App\DAO\Interfaces;

use App\Models\ExchangeRate;
use Illuminate\Support\Collection;

interface ExchangeRateDaoInterface
{
    /** @return Collection<int, ExchangeRate> */
    public function all(): Collection;

    /** Most recent rate for the given currency, or null if none exists. */
    public function currentRate(string $currency): ?ExchangeRate;

    public function create(array $attributes): ExchangeRate;

    public function delete(ExchangeRate $model): bool;
}
