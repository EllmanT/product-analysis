<?php

declare(strict_types=1);

namespace App\Events;

use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final class PaymentCompleted implements ShouldDispatchAfterCommit
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly Payment $payment,
        public readonly Invoice $invoice,
    ) {}
}
