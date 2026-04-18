<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\EcocashTransactionStatus;
use App\Models\Concerns\HasTeamScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EcocashTransaction extends Model
{
    use HasTeamScope;

    protected $table = 'ecocash_transactions';

    protected $fillable = [
        'team_id',
        'invoice_id',
        'client_correlator',
        'reference_code',
        'phone_number',
        'local_amount',
        'local_currency',
        'status',
        'ecocash_response',
        'payment_id',
        'completed_at',
    ];

    public function scopeTeam(Builder $query, int|string $teamId): void
    {
        $query->where($query->getModel()->getTable().'.team_id', $teamId);
    }

    /**
     * @return array<string, mixed>
     */
    protected function casts(): array
    {
        return [
            'status' => EcocashTransactionStatus::class,
            'local_amount' => 'decimal:2',
            'ecocash_response' => 'array',
            'completed_at' => 'datetime',
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

    /**
     * @return BelongsTo<Payment, $this>
     */
    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }
}
