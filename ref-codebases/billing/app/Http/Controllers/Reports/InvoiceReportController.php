<?php

declare(strict_types=1);

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Services\Reports\InvoiceReportService;
use Inertia\Inertia;
use Inertia\Response;

final class InvoiceReportController extends Controller
{
    public function __construct(
        private readonly InvoiceReportService $service,
    ) {}

    public function __invoke(): Response
    {
        return Inertia::render('reports/Invoices', [
            'stats' => $this->service->stats(),
            'invoicedVsCollected' => $this->service->invoicedVsCollected(),
            'aging' => $this->service->aging(),
            'overdueInvoices' => $this->service->overdueInvoices(),
        ]);
    }
}
