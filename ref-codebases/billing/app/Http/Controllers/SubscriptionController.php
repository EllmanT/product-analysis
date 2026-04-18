<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Data\SubscriptionDto;
use App\Models\Plan;
use App\Models\Subscription;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class SubscriptionController extends Controller
{
    public function index(Request $request): Response
    {
        $q = trim((string) $request->query('q', ''));
        $perPage = max(5, min(100, (int) $request->query('per_page', 10)));
        $planIdRaw = $request->query('plan_id');
        $planId = is_numeric($planIdRaw) ? max(0, (int) $planIdRaw) : null;
        $planFilter = $planId !== null && $planId > 0 ? $planId : null;

        $query = Subscription::query()->with(['customer', 'plan'])->orderByDesc('id');
        if ($planFilter !== null) {
            $query->where('subscriptions.plan_id', $planFilter);
        }
        if ($q !== '') {
            $needle = mb_strtolower($q);
            $like = '%'.$needle.'%';
            $query->where(function ($qb) use ($like): void {
                $qb->whereRaw('LOWER(subscriptions.status) LIKE ?', [$like])
                    ->orWhereHas('customer', function ($c) use ($like): void {
                        $c->whereRaw('LOWER(name) LIKE ?', [$like]);
                    })
                    ->orWhereHas('plan', function ($p) use ($like): void {
                        $p->whereRaw('LOWER(name) LIKE ?', [$like]);
                    });
            });
        }

        $p = $query->paginate($perPage)->withQueryString();
        $p->setCollection(
            $p->getCollection()->map(
                fn (Subscription $subscription) => SubscriptionDto::from($subscription)->toArray()
            )
        );

        $planOptions = Plan::query()
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(static fn (Plan $plan): array => [
                'id' => $plan->id,
                'name' => $plan->name,
            ])
            ->values();

        return Inertia::render('subscriptions/Index', [
            'items' => [
                'data' => $p->items(),
                'current_page' => $p->currentPage(),
                'last_page' => $p->lastPage(),
                'per_page' => $p->perPage(),
                'total' => $p->total(),
            ],
            'filters' => [
                'q' => $q,
                'per_page' => $perPage,
                'plan_id' => $planFilter,
            ],
            'plans' => $planOptions,
        ]);
    }
}
