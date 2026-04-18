<?php

declare(strict_types=1);

namespace App\DAO;

use App\DAO\Interfaces\ExchangeRateDaoInterface;
use App\Models\ExchangeRate;
use Illuminate\Support\Collection;

final class ExchangeRateDao implements ExchangeRateDaoInterface
{
    public function __construct(
        private readonly ExchangeRate $model,
    ) {}

    public function all(): Collection
    {
        return $this->model->newQuery()
            ->orderByDesc('effective_date')
            ->orderByDesc('id')
            ->get();
    }

    public function currentRate(string $currency): ?ExchangeRate
    {
        return $this->model->newQuery()
            ->where('currency', strtoupper($currency))
            ->orderByDesc('effective_date')
            ->orderByDesc('id')
            ->first();
    }

    public function create(array $attributes): ExchangeRate
    {
        $teamId = data_get(auth()->user(), 'team_id')
            ?? request()->attributes->get('tenant_id');

        if ($teamId !== null && $teamId !== '') {
            $attributes['team_id'] ??= $teamId;
        }

        return $this->model->newQuery()->create($attributes);
    }

    public function delete(ExchangeRate $model): bool
    {
        return (bool) $model->delete();
    }
}
