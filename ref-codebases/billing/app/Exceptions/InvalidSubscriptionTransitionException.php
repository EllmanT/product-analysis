<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Enums\SubscriptionStatus;
use RuntimeException;

final class InvalidSubscriptionTransitionException extends RuntimeException
{
    public static function fromStatuses(SubscriptionStatus $from, SubscriptionStatus $to): self
    {
        return new self(sprintf(
            'Cannot transition subscription from %s to %s.',
            $from->value,
            $to->value
        ));
    }

    public static function invalidOperation(string $message): self
    {
        return new self($message);
    }
}
