<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\BillingIntervalConfig;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class BillingIntervalController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $q = trim((string) $request->query('q', ''));
        $perPage = max(5, min(100, (int) $request->query('per_page', 10)));

        $query = BillingIntervalConfig::query()->orderBy('sort_order')->orderBy('id');
        if ($q !== '') {
            $needle = mb_strtolower($q);
            $like = '%'.$needle.'%';
            $query->where(function ($qb) use ($like): void {
                $qb->whereRaw('LOWER(label) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(value) LIKE ?', [$like]);
            });
        }

        $p = $query->paginate($perPage)->withQueryString();
        $p->setCollection(
            $p->getCollection()->map(fn ($c) => [
                'id' => $c->id,
                'label' => $c->label,
                'value' => $c->value,
                'is_recurring' => $c->is_recurring,
                'interval_count' => $c->interval_count,
                'interval_unit' => $c->interval_unit,
                'sort_order' => $c->sort_order,
            ])
        );

        return Inertia::render('billing-intervals/Index', [
            'intervals' => [
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
        ]);
    }
}
