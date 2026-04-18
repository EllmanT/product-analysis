<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Admin\Concerns\ResolvesAdminTableQuery;
use App\Http\Controllers\Controller;
use App\Models\Invoice;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class InvoiceController extends Controller
{
    use ResolvesAdminTableQuery;

    public function index(Request $request): Response
    {
        ['per_page' => $perPage, 'q' => $q] = $this->tableParams($request);

        $invoices = Invoice::query()
            ->with(['company:id,legal_name', 'buyer:id,register_name'])
            ->when($q !== '', function ($query) use ($q): void {
                $like = '%'.addcslashes($q, '%_\\').'%';
                $query->where(function ($w) use ($like): void {
                    $w->where('invoice_no', 'like', $like)
                        ->orWhere('status', 'like', $like)
                        ->orWhere('customer_reference', 'like', $like);
                });
            })
            ->orderByDesc('created_at')
            ->paginate($perPage)
            ->withQueryString();

        return Inertia::render('Admin/Invoices/Index', [
            'invoices' => $invoices,
            'filters' => [
                'q' => $q,
                'per_page' => $perPage,
            ],
        ]);
    }

    public function show(Invoice $invoice): Response
    {
        $invoice->load([
            'company:id,legal_name,trade_name,tin,email',
            'buyer:id,register_name,trade_name,tin,email,phone',
            'lines' => static fn ($query) => $query->orderBy('line_no'),
            'taxes',
            'createdByUser:id,first_name,last_name,email',
        ]);

        return Inertia::render('Admin/Invoices/Show', [
            'invoice' => $invoice,
        ]);
    }
}
