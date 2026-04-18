<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\ExchangeRate;
use App\Repositories\Interfaces\ExchangeRateRepositoryInterface;
use Illuminate\Support\Collection;
use RuntimeException;

final class ExchangeRateService
{
    /** Base currency — all amounts are stored in this currency. */
    public const BASE = 'USD';

    public function __construct(
        private readonly ExchangeRateRepositoryInterface $rates,
    ) {}

    /** @return Collection<int, ExchangeRate> */
    public function all(): Collection
    {
        return $this->rates->all();
    }

    /**
     * Most recent rate for the given currency.
     * Returns null when the currency IS the base (USD→USD = 1).
     *
     * @throws RuntimeException if the currency is unknown.
     */
    public function currentRate(string $currency): ?ExchangeRate
    {
        $currency = strtoupper($currency);

        if ($currency === self::BASE) {
            return null;
        }

        $rate = $this->rates->currentRate($currency);

        if ($rate === null) {
            throw new RuntimeException("No exchange rate configured for {$currency}. Please add one under Settings → Exchange Rates.");
        }

        return $rate;
    }

    /**
     * Convert an amount from $fromCurrency to USD.
     * Rate meaning: 1 USD = rate units of fromCurrency.
     * e.g. rate=13.5 → 1350 ZWG / 13.5 = 100 USD.
     */
    public function convertToUsd(string $amount, string $fromCurrency): string
    {
        $fromCurrency = strtoupper($fromCurrency);

        if ($fromCurrency === self::BASE) {
            return $this->normalize($amount);
        }

        $rate = $this->currentRate($fromCurrency);

        return $this->normalize(
            bcdiv($amount, (string) $rate->rate, 6)
        );
    }

    /**
     * Convert a USD amount to $toCurrency.
     * e.g. rate=13.5 → 100 USD × 13.5 = 1350 ZWG.
     */
    public function convertFromUsd(string $amount, string $toCurrency): string
    {
        $toCurrency = strtoupper($toCurrency);

        if ($toCurrency === self::BASE) {
            return $this->normalize($amount);
        }

        $rate = $this->currentRate($toCurrency);

        return $this->normalize(
            bcmul($amount, (string) $rate->rate, 6)
        );
    }

    /** Create or update a rate entry for a given date. */
    public function create(int $teamId, array $data): ExchangeRate
    {
        return $this->rates->create([
            'team_id' => $teamId,
            'currency' => strtoupper($data['currency']),
            'rate' => $data['rate'],
            'effective_date' => $data['effective_date'],
            'notes' => $data['notes'] ?? null,
        ]);
    }

    public function delete(ExchangeRate $rate): void
    {
        $this->rates->delete($rate);
    }

    /**
     * All distinct currencies that have a rate configured.
     *
     * @return Collection<int, array{currency: string, rate: string, effective_date: string}>
     */
    public function currentRates(): Collection
    {
        return $this->rates->all()
            ->groupBy('currency')
            ->map(fn (Collection $group) => $group->sortByDesc('effective_date')->first())
            ->values()
            ->map(fn (ExchangeRate $r) => [
                'currency' => $r->currency,
                'rate' => (string) $r->rate,
                'effective_date' => $r->effective_date->toDateString(),
            ]);
    }

    private function normalize(string $value): string
    {
        return number_format((float) $value, 2, '.', '');
    }
}
