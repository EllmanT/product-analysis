<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\AuditableTeamScoped;
use App\Models\Concerns\HasTeamScope;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class BillingIntervalConfig extends Model implements AuditableContract
{
    use AuditableTeamScoped;
    use HasFactory;
    use HasTeamScope;

    protected $table = 'billing_interval_configs';

    protected $fillable = [
        'team_id',
        'label',
        'value',
        'is_recurring',
        'interval_count',
        'interval_unit',
        'sort_order',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_recurring' => 'boolean',
            'interval_count' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<Team, $this>
     */
    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }
}
