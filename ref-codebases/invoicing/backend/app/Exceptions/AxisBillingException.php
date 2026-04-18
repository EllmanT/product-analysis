<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

final class AxisBillingException extends RuntimeException
{
    public function __construct(
        string $message,
        private readonly int $httpStatus = 502,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, $httpStatus, $previous);
    }

    public function httpStatus(): int
    {
        return $this->httpStatus;
    }
}

