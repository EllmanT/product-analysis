<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasTeamScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Str;

class ApiKey extends Model
{
    use HasTeamScope;

    protected $table = 'api_keys';

    protected $fillable = [
        'team_id',
        'name',
        'key_prefix',
        'key_hash',
        'last_used_at',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'last_used_at' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Team, $this> */
    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    /**
     * Products this API key is allowed to access.
     *
     * @return BelongsToMany<Product, $this>
     */
    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'api_key_products', 'api_key_id', 'product_id');
    }

    /**
     * Generate a new raw key string, its prefix, and its hash.
     * Returns ['raw' => '...', 'prefix' => '...', 'hash' => '...']
     *
     * @return array{raw: string, prefix: string, hash: string}
     */
    public static function generate(): array
    {
        $raw = 'axb_'.Str::random(40);
        $prefix = substr($raw, 0, 12);
        $hash = hash('sha256', $raw);

        return compact('raw', 'prefix', 'hash');
    }

    /** Verify a raw key string against the stored hash. */
    public function verify(string $raw): bool
    {
        return hash_equals($this->key_hash, hash('sha256', $raw));
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    /** Masked display string, e.g. axb_XXXX••••••••••••••••••••••••••••••••••• */
    public function getMaskedAttribute(): string
    {
        return substr($this->key_prefix, 0, 8).str_repeat('•', 28);
    }
}
