<?php

namespace App\Models;

use App\Data\HsCodeData;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use OwenIt\Auditing\Contracts\Auditable;
use Spatie\LaravelData\WithData;

class HsCode extends Model implements Auditable
{
    use HasFactory, HasUuids, \OwenIt\Auditing\Auditable, WithData;

    protected string $dataClass = HSCodeData::class;

    protected $fillable = [
        'code',
        'description',
        'category',
        'is_service',
        'default_tax_code',
        'is_active',
    ];

    /** @return HasMany<CompanyHsCode, $this> */
    public function companyHsCodes(): HasMany
    {
        return $this->hasMany(CompanyHsCode::class, 'hs_code_id');
    }
}
