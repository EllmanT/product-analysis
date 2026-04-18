<?php

declare(strict_types=1);

namespace App\Services\Reports;

use App\Enums\PaymentStatus;
use App\Models\Payment;
use App\Support\ReportsByMonth;
use Illuminate\Support\Carbon;

final class RevenueReportService
{
    public function stats(): array
    {
        $base = fn () => Payment::query()->where('status', PaymentStatus::Succeeded);

        $thisMonth = (float) $base()->whereYear('created_at', now()->year)->whereMonth('created_at', now()->month)->sum('amount');
        $lastMonth = (float) $base()->whereYear('created_at', now()->subMonth()->year)->whereMonth('created_at', now()->subMonth()->month)->sum('amount');
        $thisYear = (float) $base()->whereYear('created_at', now()->year)->sum('amount');
        $allTime = (float) $base()->sum('amount');
        $countMonth = $base()->whereYear('created_at', now()->year)->whereMonth('created_at', now()->month)->count();

        $monthsWithData = $base()
            ->get(['created_at'])
            ->pluck('created_at')
            ->map(fn ($d) => $d->format('Y-m'))
            ->unique()
            ->count();

        $avgMonthly = $monthsWithData > 0 ? $allTime / $monthsWithData : 0;

        return [
            'this_month' => round($thisMonth, 2),
            'last_month' => round($lastMonth, 2),
            'this_year' => round($thisYear, 2),
            'all_time' => round($allTime, 2),
            'avg_monthly' => round($avgMonthly, 2),
            'count_month' => $countMonth,
            'mom_change' => $lastMonth > 0 ? round((($thisMonth - $lastMonth) / $lastMonth) * 100, 1) : null,
        ];
    }

    public function revenueByMonth(): array
    {
        $payments = Payment::query()
            ->where('status', PaymentStatus::Succeeded)
            ->where('created_at', '>=', now()->subMonths(11)->startOfMonth())
            ->get(['amount', 'created_at']);

        $rows = ReportsByMonth::sumAmountByYearMonth($payments);

        return collect(range(0, 11))
            ->map(fn (int $i) => now()->subMonths(11 - $i)->format('Y-m'))
            ->map(fn (string $m) => [
                'month' => Carbon::createFromFormat('Y-m', $m)->format('M y'),
                'revenue' => round((float) ($rows[$m] ?? 0), 2),
            ])->values()->all();
    }

    public function revenueByPlan(): array
    {
        return Payment::query()
            ->where('payments.status', PaymentStatus::Succeeded)
            ->join('invoices', 'payments.invoice_id', '=', 'invoices.id')
            ->join('subscriptions', 'invoices.subscription_id', '=', 'subscriptions.id')
            ->join('plans', 'subscriptions.plan_id', '=', 'plans.id')
            ->selectRaw('plans.name, plans.currency, SUM(payments.amount) as total')
            ->groupByRaw('plans.id, plans.name, plans.currency')
            ->orderByDesc('total')
            ->limit(8)
            ->get()
            ->map(fn ($r) => [
                'name' => $r->name,
                'currency' => $r->currency,
                'revenue' => round((float) $r->total, 2),
            ])->all();
    }

    public function revenueByProduct(): array
    {
        return Payment::query()
            ->where('payments.status', PaymentStatus::Succeeded)
            ->join('invoices', 'payments.invoice_id', '=', 'invoices.id')
            ->join('subscriptions', 'invoices.subscription_id', '=', 'subscriptions.id')
            ->join('plans', 'subscriptions.plan_id', '=', 'plans.id')
            ->join('products', 'plans.product_id', '=', 'products.id')
            ->selectRaw('products.name, SUM(payments.amount) as total')
            ->groupByRaw('products.id, products.name')
            ->orderByDesc('total')
            ->limit(6)
            ->get()
            ->map(fn ($r) => [
                'name' => $r->name,
                'revenue' => round((float) $r->total, 2),
            ])->all();
    }
}
