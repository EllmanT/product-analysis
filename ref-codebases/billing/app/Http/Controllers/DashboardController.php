<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\DashboardService;
use Inertia\Inertia;
use Inertia\Response;

final class DashboardController extends Controller
{
    public function __construct(
        private readonly DashboardService $dashboard,
    ) {}

    public function __invoke(): Response
    {
        return Inertia::render('dashboard', [
            'stats' => $this->dashboard->stats(),
            'revenueByMonth' => $this->dashboard->revenueByMonth(),
            'invoicesByStatus' => $this->dashboard->invoicesByStatus(),
            'subscriptionsByStatus' => $this->dashboard->subscriptionsByStatus(),
        ]);
    }
}
