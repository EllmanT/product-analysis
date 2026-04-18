<?php

namespace App\Models;

use App\Data\InvoiceData;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use OwenIt\Auditing\Contracts\Auditable;
use Spatie\LaravelData\WithData;

class Invoice extends Model implements Auditable
{
    use HasFactory, HasUuids, \OwenIt\Auditing\Auditable, WithData;

    protected string $dataClass = InvoiceData::class;

    protected $fillable = [
        'company_id',
        'device_id',
        'buyer_id',
        'created_by_user_id',
        'invoice_no',
        'receipt_type',
        'receipt_print_form',
        'receipt_currency',
        'receipt_date',
        'tax_inclusive',
        'receipt_total',
        'total_excl_tax',
        'total_vat',
        'receipt_notes',
        'customer_reference',
        'payment_method',
        'payment_amount',
        'ref_invoice_id',
        'ref_invoice_no',
        'ref_invoice_date',
        'ref_customer_reference',
        'ref_device_serial',
        'status',
        'fiscal_submission_at',
        'buyer_snapshot',
        'banking_details_snapshot',
    ];

    protected function casts(): array
    {
        return [
            'receipt_date' => 'datetime',
            'ref_invoice_date' => 'datetime',
            'fiscal_submission_at' => 'datetime',
            'buyer_snapshot' => 'array',
            'banking_details_snapshot' => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(CompanyDevice::class, 'device_id');
    }

    public function buyer(): BelongsTo
    {
        return $this->belongsTo(Buyer::class);
    }

    public function createdByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(InvoiceLine::class);
    }

    public function taxes(): HasMany
    {
        return $this->hasMany(InvoiceTax::class);
    }

    public function fiscalResponse(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(FiscalResponse::class);
    }
}
