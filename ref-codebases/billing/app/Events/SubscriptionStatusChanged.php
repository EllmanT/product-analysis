<?php

declare(strict_types=1);

namespace App\Events;

use App\Enums\SubscriptionStatus;
use App\Models\Subscription;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final class SubscriptionStatusChanged
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly Subscription $subscription,
        public readonly ?SubscriptionStatus $previousStatus,
        public readonly SubscriptionStatus $newStatus,
    ) {}
}
