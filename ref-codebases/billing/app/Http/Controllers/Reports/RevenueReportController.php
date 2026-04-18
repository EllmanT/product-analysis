<?php

declare(strict_types=1);

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Services\Reports\RevenueReportService;
use Inertia\Inertia;
use Inertia\Response;

final class RevenueReportController extends Controller
{
    public function __construct(
        private readonly RevenueReportService $service,
    ) {}

    public function __invoke(): Response
    {
        return Inertia::render('reports/Revenue', [
            'stats' => $this->service->stats(),
            'revenueByMonth' => $this->service->revenueByMonth(),
            'revenueByPlan' => $this->service->revenueByPlan(),
            'revenueByProduct' => $this->service->revenueByProduct(),
        ]);
    }
}
