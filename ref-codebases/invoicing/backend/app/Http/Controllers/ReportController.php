<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesTenantCompany;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    use ResolvesTenantCompany;

    /**
     * Sales aggregated by calendar period (receipt_date) for the authenticated tenant.
     */
    public function sales(Request $request): JsonResponse
    {
        $ctx = $this->tenantDateRangeOrError($request);
        if ($ctx instanceof JsonResponse) {
            return $ctx;
        }

        $validated = $request->validate([
            'group_by' => ['sometimes', 'in:day,week,month'],
        ]);

        $groupBy = $validated['group_by'] ?? 'day';
        $driver = DB::connection()->getDriverName();
        $companyId = $ctx['company']->id;

        $base = Invoice::query()
            ->where('company_id', $companyId)
            ->whereBetween('receipt_date', [$ctx['from'], $ctx['to']]);

        $periodExpr = $this->salesPeriodExpression($driver, $groupBy);

        $rows = (clone $base)
            ->selectRaw("{$periodExpr} as period, COUNT(*) as invoice_count, COALESCE(SUM(receipt_total), 0) as revenue")
            ->groupByRaw($periodExpr)
            ->orderBy('period')
            ->get();

        $series = $rows->map(fn ($row) => [
            'period' => $row->period,
            'invoice_count' => (int) $row->invoice_count,
            'revenue' => round((float) $row->revenue, 2),
        ]);

        $summary = [
            'total_revenue' => round((float) (clone $base)->sum('receipt_total'), 2),
            'invoice_count' => (int) (clone $base)->count(),
        ];

        return response()->json([
            'from' => $ctx['from']->toDateString(),
            'to' => $ctx['toDate'],
            'group_by' => $groupBy,
            'summary' => $summary,
            'series' => $series,
        ]);
    }

    /**
     * Line-level revenue and quantity by catalog product (or line description when unlinked).
     */
    public function byProduct(Request $request): JsonResponse
    {
        $ctx = $this->tenantDateRangeOrError($request);
        if ($ctx instanceof JsonResponse) {
            return $ctx;
        }

        $companyId = $ctx['company']->id;

        $rows = InvoiceLine::query()
            ->join('invoices', 'invoice_lines.invoice_id', '=', 'invoices.id')
            ->leftJoin('products', 'invoice_lines.product_id', '=', 'products.id')
            ->where('invoices.company_id', $companyId)
            ->whereBetween('invoices.receipt_date', [$ctx['from'], $ctx['to']])
            ->selectRaw('invoice_lines.product_id')
            ->selectRaw("COALESCE(MAX(products.name), MAX(invoice_lines.description), 'Other') as product_name")
            ->selectRaw('SUM(invoice_lines.quantity) as quantity_sold')
            ->selectRaw('SUM(invoice_lines.line_total_incl) as revenue')
            ->selectRaw('COUNT(DISTINCT invoices.id) as invoice_count')
            ->groupBy('invoice_lines.product_id')
            ->orderByDesc(DB::raw('SUM(invoice_lines.line_total_incl)'))
            ->get();

        $series = $rows->map(fn ($row) => [
            'product_id' => $row->product_id,
            'product_name' => $row->product_name,
            'quantity_sold' => round((float) $row->quantity_sold, 4),
            'revenue' => round((float) $row->revenue, 2),
            'invoice_count' => (int) $row->invoice_count,
        ]);

        $lineScope = InvoiceLine::query()
            ->join('invoices', 'invoice_lines.invoice_id', '=', 'invoices.id')
            ->where('invoices.company_id', $companyId)
            ->whereBetween('invoices.receipt_date', [$ctx['from'], $ctx['to']]);

        $summary = [
            'total_revenue' => round((float) (clone $lineScope)->sum('invoice_lines.line_total_incl'), 2),
            'invoice_count' => (int) Invoice::query()
                ->where('company_id', $companyId)
                ->whereBetween('receipt_date', [$ctx['from'], $ctx['to']])
                ->count(),
            'line_count' => (int) (clone $lineScope)->count(),
        ];

        return response()->json([
            'from' => $ctx['from']->toDateString(),
            'to' => $ctx['toDate'],
            'summary' => $summary,
            'series' => $series,
        ]);
    }

    /**
     * Invoice totals grouped by buyer (walk-in when no buyer).
     */
    public function byBuyer(Request $request): JsonResponse
    {
        $ctx = $this->tenantDateRangeOrError($request);
        if ($ctx instanceof JsonResponse) {
            return $ctx;
        }

        $companyId = $ctx['company']->id;

        $rows = Invoice::query()
            ->where('invoices.company_id', $companyId)
            ->whereBetween('invoices.receipt_date', [$ctx['from'], $ctx['to']])
            ->leftJoin('buyers', 'invoices.buyer_id', '=', 'buyers.id')
            ->selectRaw('invoices.buyer_id')
            ->selectRaw("COALESCE(MAX(NULLIF(TRIM(buyers.trade_name), '')), MAX(NULLIF(TRIM(buyers.register_name), '')), 'Walk-in') as buyer_name")
            ->selectRaw('COUNT(*) as invoice_count')
            ->selectRaw('COALESCE(SUM(invoices.receipt_total), 0) as revenue')
            ->groupBy('invoices.buyer_id')
            ->orderByDesc(DB::raw('COALESCE(SUM(invoices.receipt_total), 0)'))
            ->get();

        $series = $rows->map(fn ($row) => [
            'buyer_id' => $row->buyer_id,
            'buyer_name' => $row->buyer_name,
            'invoice_count' => (int) $row->invoice_count,
            'revenue' => round((float) $row->revenue, 2),
        ]);

        $base = Invoice::query()
            ->where('company_id', $companyId)
            ->whereBetween('receipt_date', [$ctx['from'], $ctx['to']]);

        $summary = [
            'total_revenue' => round((float) (clone $base)->sum('receipt_total'), 2),
            'invoice_count' => (int) (clone $base)->count(),
        ];

        return response()->json([
            'from' => $ctx['from']->toDateString(),
            'to' => $ctx['toDate'],
            'summary' => $summary,
            'series' => $series,
        ]);
    }

    /**
     * @return array{company: \App\Models\Company, from: \Illuminate\Support\Carbon, to: \Illuminate\Support\Carbon, toDate: string}|JsonResponse
     */
    private function tenantDateRangeOrError(Request $request): JsonResponse|array
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return response()->json(['message' => 'No company is linked to this account.'], 403);
        }

        $validated = $request->validate([
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
        ]);

        $from = Carbon::parse($validated['from'])->startOfDay();
        $to = Carbon::parse($validated['to'])->endOfDay();

        if ($from->diffInDays($to) > 365 * 2) {
            return response()->json(['message' => 'Date range cannot exceed 2 years.'], 422);
        }

        return [
            'company' => $company,
            'from' => $from,
            'to' => $to,
            'toDate' => Carbon::parse($validated['to'])->toDateString(),
        ];
    }

    private function salesPeriodExpression(string $driver, string $groupBy): string
    {
        return match ($groupBy) {
            'day' => match ($driver) {
                'pgsql' => "to_char(receipt_date, 'YYYY-MM-DD')",
                'sqlite' => 'date(receipt_date)',
                default => 'date(receipt_date)',
            },
            'week' => match ($driver) {
                'pgsql' => "to_char(date_trunc('week', receipt_date), 'YYYY-MM-DD')",
                'sqlite' => "strftime('%Y-W%W', receipt_date)",
                default => "DATE_FORMAT(receipt_date, '%x-W%v')",
            },
            'month' => match ($driver) {
                'pgsql' => "to_char(receipt_date, 'YYYY-MM')",
                'sqlite' => "strftime('%Y-%m', receipt_date)",
                default => "DATE_FORMAT(receipt_date, '%Y-%m')",
            },
            default => 'date(receipt_date)',
        };
    }
}
