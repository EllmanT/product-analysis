<?php

declare(strict_types=1);

namespace App\Events;

use App\Enums\InvoiceGeneratedSource;
use App\Models\Invoice;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final class InvoiceGenerated implements ShouldDispatchAfterCommit
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly Invoice $invoice,
        public readonly InvoiceGeneratedSource $source,
    ) {}
}
