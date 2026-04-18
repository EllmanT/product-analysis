<?php

namespace App\Models;

use App\Data\CompanyData;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use OwenIt\Auditing\Contracts\Auditable;
use Spatie\LaravelData\WithData;

class Company extends Model implements Auditable
{
    use HasFactory, HasUuids, \OwenIt\Auditing\Auditable, WithData;

    protected string $dataClass = CompanyData::class;

    protected $fillable = [
        'fiscal_cloud_company_id',
        'axis_billing_team_id',
        'axis_billing_customer_id',
        'legal_name',
        'trade_name',
        'tin',
        'vat_number',
        'region',
        'station',
        'province',
        'city',
        'address_line',
        'house_number',
        'address',
        'phone',
        'email',
        'fiscal_cloud_payload',
        'logo_url',
        'is_service_company',
        'default_tax_inclusive',
        'default_currency',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'fiscal_cloud_payload' => 'array',
        ];
    }

    /** @return HasMany<CompanyHsCode, $this> */
    public function companyHsCodes(): HasMany
    {
        return $this->hasMany(CompanyHsCode::class);
    }
}
