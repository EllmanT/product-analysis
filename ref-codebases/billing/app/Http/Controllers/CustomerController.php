<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Data\Api\StoreCustomerData;
use App\Data\Api\UpdateCustomerData;
use App\Data\CustomerDto;
use App\Data\InvoiceDto;
use App\Models\Customer;
use App\Models\Invoice;
use App\Services\CustomerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class CustomerController extends Controller
{
    public function __construct(
        private readonly CustomerService $customerService,
    ) {}

    public function index(Request $request): Response
    {
        $q = trim((string) $request->query('q', ''));
        $perPage = max(5, min(100, (int) $request->query('per_page', 10)));

        $query = Customer::query()->with('subscriptions')->orderBy('name');
        if ($q !== '') {
            $needle = mb_strtolower($q);
            $like = '%'.$needle.'%';
            $query->where(function ($qb) use ($like): void {
                $qb->whereRaw('LOWER(name) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(COALESCE(email, \'\')) LIKE ?', [$like]);
            });
        }

        $p = $query->paginate($perPage)->withQueryString();
        $p->setCollection(
            $p->getCollection()
                ->map(fn (Customer $c) => CustomerDto::fromCustomer($c)->toArray())
        );

        return Inertia::render('customers/Index', [
            'items' => [
                'data' => $p->items(),
                'current_page' => $p->currentPage(),
                'last_page' => $p->lastPage(),
                'per_page' => $p->perPage(),
                'total' => $p->total(),
            ],
            'filters' => [
                'q' => $q,
                'per_page' => $perPage,
            ],
        ]);
    }

    public function show(Request $request, Customer $customer): Response|JsonResponse
    {
        if ($request->wantsJson()) {
            return response()->json([
                'data' => $this->customerService->getCustomer($customer)->toArray(),
            ]);
        }

        $q = trim((string) $request->query('q', ''));
        $perPage = max(5, min(100, (int) $request->query('per_page', 10)));

        $query = Invoice::query()
            ->where('customer_id', $customer->id)
            ->with(['customer', 'subscription'])
            ->orderByDesc('id');
        if ($q !== '') {
            $needle = mb_strtolower($q);
            $like = '%'.$needle.'%';
            $query->where(function ($qb) use ($like): void {
                $qb->whereRaw('LOWER(CAST(invoices.amount AS CHAR)) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(COALESCE(invoices.currency, \'\')) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(invoices.status) LIKE ?', [$like]);
            });
        }

        $p = $query->paginate($perPage)->withQueryString();
        $p->setCollection(
            $p->getCollection()->map(
                fn (Invoice $invoice) => InvoiceDto::from($invoice)->toArray()
            )
        );

        return Inertia::render('customers/Show', [
            'customer' => CustomerDto::fromCustomer($customer)->toArray(),
            'items' => [
                'data' => $p->items(),
                'current_page' => $p->currentPage(),
                'last_page' => $p->lastPage(),
                'per_page' => $p->perPage(),
                'total' => $p->total(),
            ],
            'filters' => [
                'q' => $q,
                'per_page' => $perPage,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = StoreCustomerData::fromRequest($request);

        return response()->json([
            'data' => $this->customerService->createCustomer($data)->toArray(),
        ], 201);
    }

    public function update(Request $request, Customer $customer): JsonResponse
    {
        $data = UpdateCustomerData::fromRequest($request);

        return response()->json([
            'data' => $this->customerService->updateCustomer($customer, $data)->toArray(),
        ]);
    }

    public function destroy(Customer $customer): JsonResponse
    {
        $this->customerService->deleteCustomer($customer);

        return response()->json(null, 204);
    }
}
