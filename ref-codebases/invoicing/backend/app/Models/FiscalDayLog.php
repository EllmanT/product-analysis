<?php

namespace App\Models;

use App\Data\FiscalDayLogData;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use OwenIt\Auditing\Contracts\Auditable;
use Spatie\LaravelData\WithData;

class FiscalDayLog extends Model implements Auditable
{
    use HasFactory, \OwenIt\Auditing\Auditable, WithData;

    protected string $dataClass = FiscalDayLogData::class;

    protected $fillable = [
        'device_id',
        'action',
        'fiscal_day_no',
        'triggered_by_user_id',
        'is_automated',
        'api_response',
    ];

    protected function casts(): array
    {
        return [
            'api_response' => 'array',
        ];
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(CompanyDevice::class, 'device_id');
    }
}
