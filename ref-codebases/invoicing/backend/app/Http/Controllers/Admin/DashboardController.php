<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Buyer;
use App\Models\Company;
use App\Models\Invoice;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

final class DashboardController extends Controller
{
    public function index(): Response
    {
        $companiesCount = Company::query()->count();
        $usersCount = User::query()->count();
        $invoicesCount = Invoice::query()->count();
        $productsCount = Product::query()->count();
        $buyersCount = Buyer::query()->count();

        $receiptTotalSum = (float) (Invoice::query()
            ->whereNotNull('receipt_total')
            ->sum(DB::raw('COALESCE(receipt_total, 0)')));

        return Inertia::render('Admin/Dashboard', [
            'stats' => [
                'companies' => $companiesCount,
                'users' => $usersCount,
                'invoices' => $invoicesCount,
                'products' => $productsCount,
                'buyers' => $buyersCount,
                'receipt_total_sum' => $receiptTotalSum,
            ],
        ]);
    }
}
