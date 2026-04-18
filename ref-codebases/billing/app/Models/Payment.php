<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\PaymentStatus;
use App\Models\Concerns\AuditableTeamScoped;
use App\Models\Concerns\HasTeamScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class Payment extends Model implements AuditableContract
{
    use AuditableTeamScoped;
    use HasFactory;
    use HasTeamScope;

    protected $table = 'payments';

    protected $fillable = [
        'team_id',
        'invoice_id',
        'amount',
        'currency',
        'original_amount',
        'exchange_rate',
        'payment_method',
        'status',
        'transaction_reference',
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
            'status' => PaymentStatus::class,
            'amount' => 'decimal:2',
            'original_amount' => 'decimal:6',
            'exchange_rate' => 'decimal:6',
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
     * @return BelongsTo<Invoice, $this>
     */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }
}
