<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\BillingIntervalConfig;
use App\Models\Plan;
use Illuminate\Support\Collection;
use RuntimeException;

final class BillingIntervalConfigService
{
    /** Ordered list of all interval configs for the current team. */
    public function ordered(): Collection
    {
        return BillingIntervalConfig::query()
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
    }

    public function create(int $teamId, array $data): BillingIntervalConfig
    {
        return BillingIntervalConfig::create([
            ...$data,
            'team_id' => $teamId,
            'interval_count' => $data['is_recurring'] ? $data['interval_count'] : null,
            'interval_unit' => $data['is_recurring'] ? $data['interval_unit'] : null,
            'sort_order' => $data['sort_order'] ?? BillingIntervalConfig::query()->max('sort_order') + 1,
        ]);
    }

    public function update(BillingIntervalConfig $config, array $data): BillingIntervalConfig
    {
        $config->update($data);

        return $config->fresh();
    }

    /**
     * @throws RuntimeException if the interval is in use by any plan.
     */
    public function deleteOrFail(BillingIntervalConfig $config): void
    {
        $inUse = Plan::withoutGlobalScopes()
            ->where('team_id', $config->team_id)
            ->where('billing_interval', $config->value)
            ->exists();

        if ($inUse) {
            throw new RuntimeException('This billing interval is used by one or more plans and cannot be deleted.');
        }

        $config->delete();
    }
}
