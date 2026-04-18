<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

/**
 * Database-agnostic month bucketing (avoids PostgreSQL-only TO_CHAR in SQLite / CI).
 *
 * @phpstan-type RowWithCreated object{ created_at: \Carbon\CarbonInterface, amount?: mixed }
 * @phpstan-type RowWithUpdated object{ updated_at: \Carbon\CarbonInterface }
 */
final class ReportsByMonth
{
    /**
     * @param  Collection<int, RowWithCreated|Model>  $models
     * @return array<string, float>
     */
    public static function sumAmountByYearMonth(Collection $models, string $amountAttribute = 'amount'): array
    {
        $out = [];
        foreach ($models as $row) {
            $m = $row->created_at->format('Y-m');
            $out[$m] = ($out[$m] ?? 0.0) + (float) $row->{$amountAttribute};
        }

        return $out;
    }

    /**
     * @param  Collection<int, RowWithCreated|Model>  $models
     * @return array<string, int>
     */
    public static function countByYearMonth(Collection $models): array
    {
        $out = [];
        foreach ($models as $row) {
            $m = $row->created_at->format('Y-m');
            $out[$m] = ($out[$m] ?? 0) + 1;
        }

        return $out;
    }

    /**
     * @param  Collection<int, RowWithUpdated|Model>  $models
     * @return array<string, int>
     */
    public static function countByUpdatedYearMonth(Collection $models): array
    {
        $out = [];
        foreach ($models as $row) {
            $m = $row->updated_at->format('Y-m');
            $out[$m] = ($out[$m] ?? 0) + 1;
        }

        return $out;
    }
}
