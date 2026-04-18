<?php

declare(strict_types=1);

namespace App\Events;

use App\Models\Subscription;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final class SubscriptionRenewed
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly Subscription $subscription,
        public readonly ?string $previousEndDate,
        public readonly string $newEndDate,
    ) {}
}
