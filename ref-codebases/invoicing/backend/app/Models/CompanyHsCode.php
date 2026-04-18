<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompanyHsCode extends Model
{
    use HasUuids;

    protected $table = 'company_hs_codes';

    protected $fillable = [
        'company_id',
        'hs_code_id',
        'is_enabled',
    ];

    protected function casts(): array
    {
        return [
            'is_enabled' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function hsCode(): BelongsTo
    {
        return $this->belongsTo(HsCode::class, 'hs_code_id');
    }
}
