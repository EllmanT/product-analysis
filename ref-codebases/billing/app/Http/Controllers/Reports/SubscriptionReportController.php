<?php

declare(strict_types=1);

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Services\Reports\SubscriptionReportService;
use Inertia\Inertia;
use Inertia\Response;

final class SubscriptionReportController extends Controller
{
    public function __construct(
        private readonly SubscriptionReportService $service,
    ) {}

    public function __invoke(): Response
    {
        return Inertia::render('reports/Subscriptions', [
            'stats' => $this->service->stats(),
            'trendByMonth' => $this->service->trendByMonth(),
            'byStatus' => $this->service->byStatus(),
            'byPlan' => $this->service->byPlan(),
        ]);
    }
}
