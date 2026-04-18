<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class ExternalPayment extends Model
{
    protected $fillable = [
        'axis_payment_id',
        'axis_invoice_id',
        'customer_id',
        'status',
        'currency',
        'amount',
        'paid_at',
        'payload',
    ];

    protected function casts(): array
    {
        return [
            'paid_at' => 'datetime',
            'amount' => 'decimal:2',
        ];
    }
}

