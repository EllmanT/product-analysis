<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

final class InvoiceGenerationException extends RuntimeException
{
    public static function fromMessage(string $message): self
    {
        return new self($message);
    }
}
