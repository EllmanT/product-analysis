<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class ExternalInvoice extends Model
{
    protected $fillable = [
        'axis_invoice_id',
        'axis_subscription_id',
        'customer_id',
        'status',
        'currency',
        'amount',
        'issued_at',
        'payload',
    ];

    protected function casts(): array
    {
        return [
            'issued_at' => 'datetime',
            'amount' => 'decimal:2',
        ];
    }
}

