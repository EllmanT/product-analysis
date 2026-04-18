<?php

namespace App\Models;

use App\Data\BankingDetailData;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use OwenIt\Auditing\Contracts\Auditable;
use Spatie\LaravelData\WithData;

class BankingDetail extends Model implements Auditable
{
    use HasFactory, \OwenIt\Auditing\Auditable, WithData;

    protected string $dataClass = BankingDetailData::class;

    protected $fillable = [
        'company_id',
        'label',
        'account_name',
        'account_number',
        'branch',
        'bank_name',
        'currency',
        'swift_code',
        'sort_order',
        'is_default',
        'is_active',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
