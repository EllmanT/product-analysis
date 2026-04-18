<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

final class PaymentRecordingException extends RuntimeException
{
    public static function invoiceNotPayable(): self
    {
        return new self('Only open invoices can receive payments.');
    }

    public static function invoiceAlreadyPaid(): self
    {
        return new self('This invoice is already paid.');
    }

    public static function amountExceedsBalance(): self
    {
        return new self('Payment amount exceeds the remaining balance on this invoice.');
    }

    public static function invalidAmount(): self
    {
        return new self('Payment amount must be greater than zero.');
    }

    public static function fromMessage(string $message): self
    {
        return new self($message);
    }
}
