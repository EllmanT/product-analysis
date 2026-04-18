<?php

declare(strict_types=1);

namespace App\Enums;

enum BillingInterval: string
{
    case OneTime = 'one_time';
    case Monthly = 'monthly';
    case Yearly = 'yearly';
}
