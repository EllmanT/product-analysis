<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\AuditableTeamScoped;
use App\Models\Concerns\HasTeamScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class Product extends Model implements AuditableContract
{
    use AuditableTeamScoped;
    use HasFactory;
    use HasTeamScope;

    protected $table = 'products';

    protected $fillable = [
        'name',
        'description',
        'team_id',
    ];

    public function scopeTeam(Builder $query, int|string $teamId): void
    {
        $query->where($query->getModel()->getTable().'.team_id', $teamId);
    }

    /**
     * @return BelongsTo<Team, $this>
     */
    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    /**
     * @return HasMany<Plan, $this>
     */
    public function plans(): HasMany
    {
        return $this->hasMany(Plan::class);
    }

    /**
     * API keys allowed to access this product.
     *
     * @return BelongsToMany<ApiKey, $this>
     */
    public function apiKeys(): BelongsToMany
    {
        return $this->belongsToMany(ApiKey::class, 'api_key_products', 'product_id', 'api_key_id');
    }
}
