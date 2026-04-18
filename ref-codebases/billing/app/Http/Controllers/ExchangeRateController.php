<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\ExchangeRate;
use App\Services\ExchangeRateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class ExchangeRateController extends Controller
{
    public function __construct(
        private readonly ExchangeRateService $service,
    ) {}

    public function index(Request $request): Response
    {
        $q = trim((string) $request->query('q', ''));
        $perPage = max(5, min(100, (int) $request->query('per_page', 10)));

        $query = ExchangeRate::query()->orderByDesc('effective_date')->orderByDesc('id');
        if ($q !== '') {
            $needle = mb_strtolower($q);
            $like = '%'.$needle.'%';
            $query->where(function ($qb) use ($like): void {
                $qb->whereRaw('LOWER(currency) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(COALESCE(notes, \'\')) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(CAST(rate AS CHAR)) LIKE ?', [$like]);
            });
        }

        $p = $query->paginate($perPage)->withQueryString();
        $p->setCollection(
            $p->getCollection()->map(fn (ExchangeRate $r) => [
                'id' => $r->id,
                'currency' => $r->currency,
                'rate' => (string) $r->rate,
                'effective_date' => $r->effective_date->toDateString(),
                'notes' => $r->notes,
                'created_at' => $r->created_at->toDateString(),
            ])
        );

        return Inertia::render('exchange-rates/Index', [
            'rates' => [
                'data' => $p->items(),
                'current_page' => $p->currentPage(),
                'last_page' => $p->lastPage(),
                'per_page' => $p->perPage(),
                'total' => $p->total(),
            ],
            'filters' => [
                'q' => $q,
                'per_page' => $perPage,
            ],
            'currentRates' => $this->service->currentRates(),
            'baseCurrency' => ExchangeRateService::BASE,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'currency' => ['required', 'string', 'max:10'],
            'rate' => ['required', 'numeric', 'min:0.000001'],
            'effective_date' => ['required', 'date'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $teamId = (int) ($request->attributes->get('tenant_id') ?? auth()->user()?->team_id);
        $rate = $this->service->create($teamId, $data);

        return response()->json([
            'id' => $rate->id,
            'currency' => $rate->currency,
            'rate' => (string) $rate->rate,
            'effective_date' => $rate->effective_date->toDateString(),
            'notes' => $rate->notes,
            'created_at' => $rate->created_at->toDateString(),
        ], 201);
    }

    public function destroy(ExchangeRate $exchangeRate): JsonResponse
    {
        $this->service->delete($exchangeRate);

        return response()->json(['message' => 'Exchange rate deleted.']);
    }
}
