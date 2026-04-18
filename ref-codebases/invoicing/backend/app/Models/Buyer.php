<?php

namespace App\Models;

use App\Data\BuyerData;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use OwenIt\Auditing\Contracts\Auditable;
use Spatie\LaravelData\WithData;

class Buyer extends Model implements Auditable
{
    use HasFactory, HasUuids, \OwenIt\Auditing\Auditable, WithData;

    protected string $dataClass = BuyerData::class;

    protected $fillable = [
        'company_id',
        'register_name',
        'trade_name',
        'tin',
        'vat_number',
        'address_province',
        'address_city',
        'address_street',
        'address_house_no',
        'email',
        'phone',
        'is_active',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
