<?php

declare(strict_types=1);

namespace App\Services\Reports;

use App\Enums\SubscriptionStatus;
use App\Models\Subscription;
use App\Support\ReportsByMonth;
use Illuminate\Support\Carbon;

final class SubscriptionReportService
{
    public function stats(): array
    {
        $active = Subscription::query()->where('status', SubscriptionStatus::Active)->count();
        $trialing = Subscription::query()->where('status', SubscriptionStatus::Trialing)->count();
        $pastDue = Subscription::query()->where('status', SubscriptionStatus::PastDue)->count();
        $total = Subscription::query()->count();
        $cancelledMonth = Subscription::query()
            ->where('status', SubscriptionStatus::Cancelled)
            ->whereYear('updated_at', now()->year)
            ->whereMonth('updated_at', now()->month)
            ->count();
        $newThisMonth = Subscription::query()
            ->whereYear('created_at', now()->year)
            ->whereMonth('created_at', now()->month)
            ->count();

        return [
            'active' => $active,
            'trialing' => $trialing,
            'past_due' => $pastDue,
            'total' => $total,
            'new_this_month' => $newThisMonth,
            'cancelled_month' => $cancelledMonth,
            'churn_rate' => $total > 0 ? round(($cancelledMonth / max($total, 1)) * 100, 1) : 0,
        ];
    }

    public function trendByMonth(): array
    {
        $newModels = Subscription::query()
            ->where('created_at', '>=', now()->subMonths(11)->startOfMonth())
            ->get(['created_at']);

        $cancelledModels = Subscription::query()
            ->where('status', SubscriptionStatus::Cancelled)
            ->where('updated_at', '>=', now()->subMonths(11)->startOfMonth())
            ->get(['updated_at']);

        $newRows = ReportsByMonth::countByYearMonth($newModels);
        $cancelledRows = ReportsByMonth::countByUpdatedYearMonth($cancelledModels);

        return collect(range(0, 11))
            ->map(fn (int $i) => now()->subMonths(11 - $i)->format('Y-m'))
            ->map(fn (string $m) => [
                'month' => Carbon::createFromFormat('Y-m', $m)->format('M y'),
                'new' => (int) ($newRows[$m] ?? 0),
                'cancelled' => (int) ($cancelledRows[$m] ?? 0),
            ])->values()->all();
    }

    public function byStatus(): array
    {
        $colors = [
            'active' => '#2f9e44',
            'trialing' => '#1971c2',
            'past_due' => '#e03131',
            'cancelled' => '#868e96',
            'expired' => '#adb5bd',
        ];

        $rows = Subscription::query()
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        return collect($colors)->map(fn ($color, $status) => [
            'name' => ucwords(str_replace('_', ' ', $status)),
            'value' => (int) ($rows[$status] ?? 0),
            'color' => $color,
        ])->values()->all();
    }

    public function byPlan(): array
    {
        return Subscription::query()
            ->join('plans', 'subscriptions.plan_id', '=', 'plans.id')
            ->selectRaw('plans.name, COUNT(subscriptions.id) as total, SUM(CASE WHEN subscriptions.status = ? THEN 1 ELSE 0 END) as active', [SubscriptionStatus::Active->value])
            ->groupByRaw('plans.id, plans.name')
            ->orderByDesc('total')
            ->limit(8)
            ->get()
            ->map(fn ($r) => [
                'plan' => $r->name,
                'total' => (int) $r->total,
                'active' => (int) $r->active,
            ])->all();
    }
}
