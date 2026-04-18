<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\InvoiceStatus;
use App\Enums\PaymentStatus;
use App\Enums\SubscriptionStatus;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\Product;
use App\Models\Subscription;
use App\Support\ReportsByMonth;
use Illuminate\Support\Carbon;

final class DashboardService
{
    public function stats(): array
    {
        return [
            'customers' => Customer::query()->count(),
            'products' => Product::query()->count(),
            'plans' => Plan::query()->count(),
            'subscriptions' => Subscription::query()->count(),
            'subscriptions_active' => Subscription::query()->where('status', SubscriptionStatus::Active)->count(),
            'invoices' => Invoice::query()->count(),
            'invoices_open' => Invoice::query()->whereIn('status', InvoiceStatus::outstanding())->count(),
            'invoices_paid' => Invoice::query()->where('status', InvoiceStatus::Paid)->count(),
            'payments_count' => Payment::query()->where('status', PaymentStatus::Succeeded)->count(),
            'payments_total' => (string) Payment::query()->where('status', PaymentStatus::Succeeded)->sum('amount'),
            'payments_this_month' => (string) Payment::query()
                ->where('status', PaymentStatus::Succeeded)
                ->whereYear('created_at', now()->year)
                ->whereMonth('created_at', now()->month)
                ->sum('amount'),
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

    public function invoicesByStatus(): array
    {
        $rows = Invoice::query()
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        $colors = [
            'draft' => '#868e96',
            'open' => '#fd7e14',
            'overdue' => '#c92a2a',
            'paid' => '#2f9e44',
            'void' => '#adb5bd',
            'uncollectible' => '#e03131',
        ];

        return collect($colors)->map(fn ($color, $status) => [
            'name' => ucfirst($status),
            'value' => (int) ($rows[$status] ?? 0),
            'color' => $color,
        ])->values()->all();
    }

    public function subscriptionsByStatus(): array
    {
        $rows = Subscription::query()
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        $colors = [
            'active' => '#2f9e44',
            'trialing' => '#1971c2',
            'past_due' => '#e03131',
            'cancelled' => '#868e96',
            'expired' => '#adb5bd',
        ];

        return collect($colors)->map(fn ($color, $status) => [
            'name' => ucwords(str_replace('_', ' ', $status)),
            'value' => (int) ($rows[$status] ?? 0),
            'color' => $color,
        ])->values()->all();
    }
}
