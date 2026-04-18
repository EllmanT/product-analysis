<?php

declare(strict_types=1);

namespace App\Enums;

enum InvoiceStatus: string
{
    case Draft = 'draft';
    case Open = 'open';
    case Overdue = 'overdue';
    case Paid = 'paid';
    case Void = 'void';
    case Uncollectible = 'uncollectible';

    /**
     * Invoices that can receive payments (not finalized as paid / void / etc.).
     *
     * @return list<self>
     */
    public static function payable(): array
    {
        return [self::Open, self::Overdue];
    }

    /**
     * Unpaid invoice statuses (for dashboards and outstanding totals).
     *
     * @return list<self>
     */
    public static function outstanding(): array
    {
        return [self::Open, self::Overdue];
    }
}
