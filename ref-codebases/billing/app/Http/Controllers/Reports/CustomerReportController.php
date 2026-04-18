<?php

declare(strict_types=1);

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Services\Reports\CustomerReportService;
use Inertia\Inertia;
use Inertia\Response;

final class CustomerReportController extends Controller
{
    public function __construct(
        private readonly CustomerReportService $service,
    ) {}

    public function __invoke(): Response
    {
        return Inertia::render('reports/Customers', [
            'stats' => $this->service->stats(),
            'customersByMonth' => $this->service->customersByMonth(),
            'topCustomers' => $this->service->topCustomers(),
        ]);
    }
}
