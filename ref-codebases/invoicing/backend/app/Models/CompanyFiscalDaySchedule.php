<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompanyFiscalDaySchedule extends Model
{
    use HasUuids;

    protected $fillable = [
        'company_id',
        'is_enabled',
        'auto_close_enabled',
        'auto_open_enabled',
        'close_time',
        'open_time',
        'close_weekdays',
        'open_weekdays',
        'timezone',
        'last_auto_close_date',
        'last_auto_open_date',
    ];

    protected function casts(): array
    {
        return [
            'is_enabled' => 'boolean',
            'auto_close_enabled' => 'boolean',
            'auto_open_enabled' => 'boolean',
            'close_weekdays' => 'array',
            'open_weekdays' => 'array',
            'last_auto_close_date' => 'date',
            'last_auto_open_date' => 'date',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
