<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class UserActivationCode extends Model
{
    use HasUuids;

    protected $fillable = [
        'user_id',
        'code_hash',
        'code_hint',
        'revoked_at',
        'last_used_at',
    ];

    protected function casts(): array
    {
        return [
            'revoked_at' => 'datetime',
            'last_used_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isActive(): bool
    {
        return $this->revoked_at === null;
    }
}
