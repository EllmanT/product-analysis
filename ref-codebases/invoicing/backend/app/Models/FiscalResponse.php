<?php

namespace App\Models;

use App\Data\FiscalResponseData;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use OwenIt\Auditing\Contracts\Auditable;
use Spatie\LaravelData\WithData;

class FiscalResponse extends Model implements Auditable
{
    use HasFactory, HasUuids, \OwenIt\Auditing\Auditable, WithData;

    protected string $dataClass = FiscalResponseData::class;

    protected $fillable = [
        'invoice_id',
        'qr_code_url',
        'verification_code',
        'verification_link',
        'fiscal_day_no',
        'receipt_global_no',
        'receipt_counter',
        'receipt_id',
        'device_id',
        'fdms_invoice_no',
        'api_response_code',
        'api_response_message',
        'raw_response',
        'submitted_at',
    ];

    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime',
            'raw_response' => 'array',
        ];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }
}
