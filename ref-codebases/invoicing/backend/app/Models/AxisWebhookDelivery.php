<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class AxisWebhookDelivery extends Model
{
    protected $fillable = [
        'payload_hash',
        'payload',
    ];
}

