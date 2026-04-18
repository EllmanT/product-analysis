<?php

namespace App\Models;

use App\Data\InvoiceLineData;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use OwenIt\Auditing\Contracts\Auditable;
use Spatie\LaravelData\WithData;

class InvoiceLine extends Model implements Auditable
{
    use HasFactory, HasUuids, \OwenIt\Auditing\Auditable, WithData;

    protected string $dataClass = InvoiceLineData::class;

    protected $fillable = [
        'invoice_id',
        'line_no',
        'line_type',
        'hs_code',
        'description',
        'quantity',
        'unit_price',
        'tax_code',
        'tax_percent',
        'vat_amount',
        'line_total_excl',
        'line_total_incl',
        'product_id',
    ];

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
