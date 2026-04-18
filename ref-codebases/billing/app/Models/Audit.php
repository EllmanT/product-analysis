<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use OwenIt\Auditing\Models\Audit as AuditModel;

final class Audit extends AuditModel
{
    /**
     * @var array<string, string>
     */
    protected $casts = [
        'old_values' => 'json',
        'new_values' => 'json',
        'team_id' => 'integer',
    ];

    /**
     * @param  Builder<Audit>  $query
     * @return Builder<Audit>
     */
    public function scopeForTeam(Builder $query, int $teamId): Builder
    {
        return $query->where($query->getModel()->getTable().'.team_id', $teamId);
    }
}
