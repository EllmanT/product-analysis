<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Builder;

/**
 * Scopes queries to the authenticated user's team_id (or teams.id for the Team model).
 * When authenticated but team_id is missing, returns no rows to prevent cross-tenant leakage.
 */
trait HasTeamScope
{
    protected static function bootHasTeamScope(): void
    {
        static::addGlobalScope('team', function (Builder $query): void {
            if (auth()->hasUser()) {
                // Session-authenticated: team_id must be present or we block everything.
                $teamId = data_get(auth()->user(), 'team_id');

                if ($teamId === null || $teamId === '') {
                    $query->whereRaw('0 = 1');

                    return;
                }
            } else {
                // API key auth sets tenant_id on request attributes.
                // No context at all (e.g. artisan) → skip scope.
                try {
                    $teamId = app('request')->attributes->get('tenant_id');
                } catch (\Throwable) {
                    return;
                }

                if ($teamId === null) {
                    return;
                }
            }

            $teamId = (int) $teamId;
            $model = $query->getModel();
            $column = $model::teamScopeColumn();
            $table = $model->getTable();
            $query->where($table.'.'.$column, $teamId);
        });
    }

    /**
     * Foreign key column on tenant-owned models; Team uses `id` (current team row).
     */
    public static function teamScopeColumn(): string
    {
        return 'team_id';
    }
}
