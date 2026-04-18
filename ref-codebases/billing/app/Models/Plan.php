<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\AuditableTeamScoped;
use App\Models\Concerns\HasTeamScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class Plan extends Model implements AuditableContract
{
    use AuditableTeamScoped;
    use HasFactory;
    use HasTeamScope;

    protected $table = 'plans';

    protected $fillable = [
        'team_id',
        'product_id',
        'name',
        'billing_interval',
        'price',
        'currency',
        'trial_days',
        'payment_platforms',
    ];

    public function scopeTeam(Builder $query, int|string $teamId): void
    {
        $query->where($query->getModel()->getTable().'.team_id', $teamId);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'trial_days' => 'integer',
            'payment_platforms' => 'array',
        ];
    }

    /**
     * @return BelongsTo<Team, $this>
     */
    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    /**
     * @return BelongsTo<Product, $this>
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * @return HasMany<Subscription, $this>
     */
    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }
}
