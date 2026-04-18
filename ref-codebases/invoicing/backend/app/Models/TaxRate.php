<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TaxRate extends Model
{
    use HasUuids;

    protected $fillable = [
        'code',
        'label',
        'percent',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'percent' => 'decimal:2',
            'sort_order' => 'integer',
        ];
    }
}
