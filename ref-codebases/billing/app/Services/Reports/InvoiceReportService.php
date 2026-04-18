<?php

declare(strict_types=1);

namespace App\Services\Reports;

use App\Enums\InvoiceStatus;
use App\Enums\PaymentStatus;
use App\Models\Invoice;
use App\Models\Payment;
use App\Support\ReportsByMonth;
use Illuminate\Support\Carbon;

final class InvoiceReportService
{
    public function stats(): array
    {
        $outstanding = (float) Invoice::query()->whereIn('status', InvoiceStatus::outstanding())->sum('amount');
        $overdueCount = Invoice::query()
            ->whereIn('status', InvoiceStatus::outstanding())
            ->whereDate('due_date', '<', now())
            ->count();
        $overdueAmount = (float) Invoice::query()
            ->whereIn('status', InvoiceStatus::outstanding())
            ->whereDate('due_date', '<', now())
            ->sum('amount');
        $totalInvoiced = (float) Invoice::query()->whereIn('status', [InvoiceStatus::Open, InvoiceStatus::Overdue, InvoiceStatus::Paid])->sum('amount');
        $totalCollected = (float) Payment::query()->where('status', PaymentStatus::Succeeded)->sum('amount');
        $collectionRate = $totalInvoiced > 0 ? round(($totalCollected / $totalInvoiced) * 100, 1) : 0;

        $paidThisMonth = Invoice::query()
            ->where('status', InvoiceStatus::Paid)
            ->whereYear('updated_at', now()->year)
            ->whereMonth('updated_at', now()->month)
            ->count();

        return [
            'outstanding' => round($outstanding, 2),
            'overdue_count' => $overdueCount,
            'overdue_amount' => round($overdueAmount, 2),
            'collection_rate' => $collectionRate,
            'paid_this_month' => $paidThisMonth,
            'total_invoiced' => round($totalInvoiced, 2),
        ];
    }

    public function invoicedVsCollected(): array
    {
        $invoiceRows = Invoice::query()
            ->whereIn('status', [InvoiceStatus::Open, InvoiceStatus::Overdue, InvoiceStatus::Paid])
            ->where('created_at', '>=', now()->subMonths(11)->startOfMonth())
            ->get(['amount', 'created_at']);

        $paymentRows = Payment::query()
            ->where('status', PaymentStatus::Succeeded)
            ->where('created_at', '>=', now()->subMonths(11)->startOfMonth())
            ->get(['amount', 'created_at']);

        $invoiced = ReportsByMonth::sumAmountByYearMonth($invoiceRows);
        $collected = ReportsByMonth::sumAmountByYearMonth($paymentRows);

        return collect(range(0, 11))
            ->map(fn (int $i) => now()->subMonths(11 - $i)->format('Y-m'))
            ->map(fn (string $m) => [
                'month' => Carbon::createFromFormat('Y-m', $m)->format('M y'),
                'invoiced' => round((float) ($invoiced[$m] ?? 0), 2),
                'collected' => round((float) ($collected[$m] ?? 0), 2),
            ])->values()->all();
    }

    public function aging(): array
    {
        $invoices = Invoice::query()
            ->whereIn('status', InvoiceStatus::outstanding())
            ->whereDate('due_date', '<', now())
            ->get(['amount', 'due_date']);

        $buckets = [
            '0–30 days' => ['count' => 0, 'total' => 0.0],
            '31–60 days' => ['count' => 0, 'total' => 0.0],
            '61–90 days' => ['count' => 0, 'total' => 0.0],
            '90+ days' => ['count' => 0, 'total' => 0.0],
        ];

        $today = now()->startOfDay();

        foreach ($invoices as $inv) {
            if ($inv->due_date === null) {
                continue;
            }
            $days = (int) $inv->due_date->copy()->startOfDay()->diffInDays($today);
            $label = match (true) {
                $days <= 30 => '0–30 days',
                $days <= 60 => '31–60 days',
                $days <= 90 => '61–90 days',
                default => '90+ days',
            };
            $buckets[$label]['count']++;
            $buckets[$label]['total'] += (float) $inv->amount;
        }

        $order = ['0–30 days', '31–60 days', '61–90 days', '90+ days'];

        return collect($order)->map(fn (string $b) => [
            'bucket' => $b,
            'count' => $buckets[$b]['count'],
            'total' => round($buckets[$b]['total'], 2),
        ])->all();
    }

    public function overdueInvoices(): array
    {
        return Invoice::query()
            ->with('customer')
            ->whereIn('status', InvoiceStatus::outstanding())
            ->whereDate('due_date', '<', now())
            ->orderBy('due_date')
            ->limit(25)
            ->get()
            ->map(fn ($inv) => [
                'customer' => $inv->customer?->name ?? '—',
                'amount' => (float) $inv->amount,
                'currency' => $inv->currency,
                'due_date' => $inv->due_date?->format('Y-m-d'),
                'days_overdue' => (int) now()->startOfDay()->diffInDays($inv->due_date?->startOfDay()),
            ])->all();
    }
}
