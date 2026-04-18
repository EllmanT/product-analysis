<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class ExternalSubscription extends Model
{
    protected $fillable = [
        'axis_subscription_id',
        'team_id',
        'customer_id',
        'plan_id',
        'status',
    ];
}

