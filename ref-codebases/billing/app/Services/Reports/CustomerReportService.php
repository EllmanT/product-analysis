<?php

declare(strict_types=1);

namespace App\Services\Reports;

use App\Enums\PaymentStatus;
use App\Models\Customer;
use App\Models\Payment;
use App\Support\ReportsByMonth;
use Illuminate\Support\Carbon;

final class CustomerReportService
{
    public function stats(): array
    {
        $total = Customer::query()->count();
        $thisMonth = Customer::query()->whereYear('created_at', now()->year)->whereMonth('created_at', now()->month)->count();
        $lastMonth = Customer::query()->whereYear('created_at', now()->subMonth()->year)->whereMonth('created_at', now()->subMonth()->month)->count();
        $thisYear = Customer::query()->whereYear('created_at', now()->year)->count();

        return [
            'total' => $total,
            'this_month' => $thisMonth,
            'last_month' => $lastMonth,
            'this_year' => $thisYear,
            'mom_change' => $lastMonth > 0 ? round((($thisMonth - $lastMonth) / $lastMonth) * 100, 1) : null,
        ];
    }

    public function customersByMonth(): array
    {
        $customers = Customer::query()
            ->where('created_at', '>=', now()->subMonths(11)->startOfMonth())
            ->get(['created_at']);

        $rows = ReportsByMonth::countByYearMonth($customers);

        return collect(range(0, 11))
            ->map(fn (int $i) => now()->subMonths(11 - $i)->format('Y-m'))
            ->map(fn (string $m) => [
                'month' => Carbon::createFromFormat('Y-m', $m)->format('M y'),
                'count' => (int) ($rows[$m] ?? 0),
            ])->values()->all();
    }

    public function topCustomers(): array
    {
        return Payment::query()
            ->where('payments.status', PaymentStatus::Succeeded)
            ->join('invoices', 'payments.invoice_id', '=', 'invoices.id')
            ->join('customers', 'invoices.customer_id', '=', 'customers.id')
            ->selectRaw('customers.name, SUM(payments.amount) as total, COUNT(payments.id) as payment_count')
            ->groupByRaw('customers.id, customers.name')
            ->orderByDesc('total')
            ->limit(10)
            ->get()
            ->map(fn ($r) => [
                'name' => $r->name,
                'total' => round((float) $r->total, 2),
                'payment_count' => (int) $r->payment_count,
            ])->all();
    }
}
