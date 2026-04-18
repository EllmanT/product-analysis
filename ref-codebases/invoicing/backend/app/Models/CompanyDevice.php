<?php

namespace App\Models;

use App\Data\CompanyDeviceData;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use OwenIt\Auditing\Contracts\Auditable;
use Spatie\LaravelData\WithData;

class CompanyDevice extends Model implements Auditable
{
    use HasFactory, HasUuids, \OwenIt\Auditing\Auditable, WithData;

    protected string $dataClass = CompanyDeviceData::class;

    protected $fillable = [
        'company_id',
        'fiscal_device_id',
        'device_serial_no',
        'device_name',
        'zimra_device_id',
        'zimra_activation_key',
        'zimra_environment',
        'zimra_payload',
        'fiscal_cloud_activated_at',
        'fiscal_cloud_activation_payload',
        'activation_status',
        'activation_attempted_at',
        'activation_error',
        'zimra_fdms_template_emailed_at',
        'zimra_fdms_invoices_generated_at',
        'fiscal_day_status',
        'fiscal_day_open_at',
        'is_active',
        'auto_open_close_day',
        'fiscal_cloud_payload',
    ];

    protected function casts(): array
    {
        return [
            'fiscal_cloud_activated_at' => 'datetime',
            'fiscal_day_open_at' => 'datetime',
            'fiscal_cloud_payload' => 'array',
            'zimra_payload' => 'array',
            'fiscal_cloud_activation_payload' => 'array',
            'activation_attempted_at' => 'datetime',
            'zimra_fdms_template_emailed_at' => 'datetime',
            'zimra_fdms_invoices_generated_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
