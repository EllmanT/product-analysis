<?php

namespace App\Models;

use App\Data\UserData;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\HasApiTokens;
use OwenIt\Auditing\Contracts\Auditable;
use Spatie\LaravelData\WithData;

class User extends Authenticatable implements Auditable
{
    use HasApiTokens, HasFactory, HasUuids, \OwenIt\Auditing\Auditable, WithData;

    protected string $dataClass = UserData::class;

    protected $fillable = [
        'company_id',
        'fiscal_cloud_user_id',
        'first_name',
        'last_name',
        'email',
        'phone',
        'password',
        'oauth_provider',
        'oauth_provider_id',
        'role',
        'is_active',
        'email_verified_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }

    /**
     * Accept plain text or an existing bcrypt/argon hash (e.g. imported from Fiscal Cloud).
     */
    public function setPasswordAttribute(?string $value): void
    {
        if ($value === null || $value === '') {
            $this->attributes['password'] = null;

            return;
        }
        if (
            str_starts_with($value, '$2y$')
            || str_starts_with($value, '$2a$')
            || str_starts_with($value, '$2b$')
            || str_starts_with($value, '$argon')
        ) {
            $this->attributes['password'] = $value;

            return;
        }
        $this->attributes['password'] = Hash::make($value);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function activationCodes(): HasMany
    {
        return $this->hasMany(UserActivationCode::class);
    }

    public function isSuperAdmin(): bool
    {
        return $this->role === 'SUPER_ADMIN';
    }
}
