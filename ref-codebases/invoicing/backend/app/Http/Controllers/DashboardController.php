<?php

namespace App\Http\Controllers;

use App\Models\Buyer;
use App\Models\Company;
use App\Models\Invoice;
use App\Models\Product;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * Analytics for the authenticated tenant (company from the logged-in user).
     */
    public function __invoke(): JsonResponse
    {
        $user = auth()->user();
        if (! $user instanceof User) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $companyId = $user->company_id;
        if (! is_string($companyId) || $companyId === '') {
            return response()->json([
                'has_company' => false,
                'message' => 'No company is linked to this account yet.',
            ]);
        }

        $company = Company::query()
            ->where('id', $companyId)
            ->where('is_active', true)
            ->first(['id', 'legal_name', 'trade_name', 'tin']);

        if ($company === null) {
            return response()->json([
                'has_company' => false,
                'message' => 'No company is linked to this account yet.',
            ]);
        }

        $productsCount = Product::query()
            ->where('company_id', $company->id)
            ->where('is_active', true)
            ->count();

        $buyersCount = Buyer::query()
            ->where('company_id', $company->id)
            ->where('is_active', true)
            ->count();

        $invoicesTotal = Invoice::query()->where('company_id', $company->id)->count();

        $statusRows = Invoice::query()
            ->where('company_id', $company->id)
            ->selectRaw('status, COUNT(*) as cnt')
            ->groupBy('status')
            ->pluck('cnt', 'status');

        $receiptSum = (float) Invoice::query()
            ->where('company_id', $company->id)
            ->sum('receipt_total');

        $driver = DB::connection()->getDriverName();
        $dayKey = match ($driver) {
            'pgsql' => "to_char(receipt_date, 'YYYY-MM-DD')",
            'sqlite' => 'date(receipt_date)',
            default => 'date(receipt_date)',
        };

        $from = now()->subDays(30)->startOfDay();

        $invoicesByDay = Invoice::query()
            ->where('company_id', $company->id)
            ->where('receipt_date', '>=', $from)
            ->selectRaw("{$dayKey} as day, COUNT(*) as invoice_count, COALESCE(SUM(receipt_total), 0) as revenue")
            ->groupByRaw($dayKey)
            ->orderBy('day')
            ->get()
            ->map(fn ($row) => [
                'date' => $row->day,
                'invoice_count' => (int) $row->invoice_count,
                'revenue' => round((float) $row->revenue, 2),
            ]);

        $fromWeeks = now()->subWeeks(12)->startOfWeek();

        $revenueByWeekQuery = Invoice::query()
            ->where('company_id', $company->id)
            ->where('receipt_date', '>=', $fromWeeks);

        if ($driver === 'pgsql') {
            $weekKey = "to_char(date_trunc('week', receipt_date), 'YYYY-MM-DD')";
            $revenueByWeek = $revenueByWeekQuery
                ->selectRaw("{$weekKey} as period, COALESCE(SUM(receipt_total), 0) as revenue")
                ->groupByRaw($weekKey)
                ->orderBy('period')
                ->get();
        } elseif ($driver === 'sqlite') {
            $weekKey = "strftime('%Y-W%W', receipt_date)";
            $revenueByWeek = $revenueByWeekQuery
                ->selectRaw("{$weekKey} as period, COALESCE(SUM(receipt_total), 0) as revenue")
                ->groupByRaw($weekKey)
                ->orderBy('period')
                ->get();
        } else {
            $weekKey = "DATE_FORMAT(receipt_date, '%x-W%v')";
            $revenueByWeek = $revenueByWeekQuery
                ->selectRaw("{$weekKey} as period, COALESCE(SUM(receipt_total), 0) as revenue")
                ->groupByRaw($weekKey)
                ->orderBy('period')
                ->get();
        }

        $revenueByWeek = $revenueByWeek->map(fn ($row) => [
            'period' => $row->period,
            'revenue' => round((float) $row->revenue, 2),
        ]);

        $invoicesByStatus = $statusRows->map(fn ($c, $status) => [
            'status' => $status,
            'count' => (int) $c,
        ])->values();

        return response()->json([
            'has_company' => true,
            'company' => [
                'id' => $company->id,
                'legal_name' => $company->legal_name,
                'trade_name' => $company->trade_name,
                'tin' => $company->tin,
            ],
            'totals' => [
                'products' => $productsCount,
                'buyers' => $buyersCount,
                'invoices' => $invoicesTotal,
                'receipt_total_sum' => round($receiptSum, 2),
            ],
            'invoices_by_status' => $invoicesByStatus,
            'invoices_by_day' => $invoicesByDay,
            'revenue_by_week' => $revenueByWeek,
        ]);
    }
}
