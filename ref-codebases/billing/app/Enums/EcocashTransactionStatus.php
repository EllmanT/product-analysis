<?php

declare(strict_types=1);

namespace App\Enums;

enum EcocashTransactionStatus: string
{
    case Pending = 'pending';
    case Completed = 'completed';
    case Failed = 'failed';
    case Cancelled = 'cancelled';
}
