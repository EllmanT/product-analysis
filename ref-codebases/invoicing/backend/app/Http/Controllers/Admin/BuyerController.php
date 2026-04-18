<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Admin\Concerns\ResolvesAdminTableQuery;
use App\Http\Controllers\Controller;
use App\Models\Buyer;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class BuyerController extends Controller
{
    use ResolvesAdminTableQuery;

    public function index(Request $request): Response
    {
        ['per_page' => $perPage, 'q' => $q] = $this->tableParams($request);

        $buyers = Buyer::query()
            ->with('company:id,legal_name')
            ->when($q !== '', function ($query) use ($q): void {
                $like = '%'.addcslashes($q, '%_\\').'%';
                $query->where(function ($w) use ($like): void {
                    $w->where('register_name', 'like', $like)
                        ->orWhere('trade_name', 'like', $like)
                        ->orWhere('tin', 'like', $like)
                        ->orWhere('email', 'like', $like);
                });
            })
            ->orderByDesc('created_at')
            ->paginate($perPage)
            ->withQueryString();

        return Inertia::render('Admin/Buyers/Index', [
            'buyers' => $buyers,
            'filters' => [
                'q' => $q,
                'per_page' => $perPage,
            ],
        ]);
    }
}
