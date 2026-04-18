<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\AuditService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class AuditTrailController extends Controller
{
    public function __construct(
        private readonly AuditService $service,
    ) {}

    public function __invoke(Request $request): Response
    {
        $teamId = (int) $request->attributes->get('tenant_id');
        $p = $this->service->paginatedForTeam($request, $teamId);

        return Inertia::render('audit/Index', [
            'audits' => [
                'data' => $p->items(),
                'current_page' => $p->currentPage(),
                'last_page' => $p->lastPage(),
                'per_page' => $p->perPage(),
                'total' => $p->total(),
            ],
            'filters' => [
                'q' => trim((string) $request->query('q', '')),
                'per_page' => max(5, min(100, (int) $request->query('per_page', 10))),
            ],
        ]);
    }
}
