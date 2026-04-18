<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Data\Api\UpdatePaymentData;
use App\Data\PaymentDto;
use App\Data\RecordPaymentInputData;
use App\Models\Invoice;
use App\Models\Payment;
use App\Repositories\Interfaces\InvoiceRepositoryInterface;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class PaymentController extends Controller
{
    public function __construct(
        private readonly InvoiceRepositoryInterface $invoiceRepository,
        private readonly PaymentService $paymentService,
    ) {}

    public function index(Request $request): Response
    {
        $q = trim((string) $request->query('q', ''));
        $perPage = max(5, min(100, (int) $request->query('per_page', 10)));

        $query = Payment::query()->orderByDesc('id');
        if ($q !== '') {
            $needle = mb_strtolower($q);
            $like = '%'.$needle.'%';
            $query->where(function ($qb) use ($like): void {
                $qb->whereRaw('LOWER(CAST(payments.amount AS CHAR)) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(COALESCE(payments.currency, \'\')) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(payments.status) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(payments.payment_method) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(COALESCE(payments.transaction_reference, \'\')) LIKE ?', [$like])
                    ->orWhereHas('invoice', function ($inv) use ($like): void {
                        $inv->whereHas('customer', function ($c) use ($like): void {
                            $c->whereRaw('LOWER(name) LIKE ?', [$like]);
                        });
                    });
            });
        }

        $p = $query->paginate($perPage)->withQueryString();
        $p->setCollection(
            $p->getCollection()->map(
                fn (Payment $payment) => PaymentDto::fromPayment($payment)->toArray()
            )
        );

        $openInvoices = $this->invoiceRepository->openOrdered()
            ->map(fn (Invoice $invoice) => [
                'id' => $invoice->id,
                'amount' => (string) $invoice->amount,
                'currency' => $invoice->currency,
                'due_date' => $invoice->due_date?->toDateString(),
                'customer_id' => $invoice->customer_id,
            ])
            ->values();

        return Inertia::render('payments/Index', [
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
            'openInvoices' => $openInvoices,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = RecordPaymentInputData::fromRequest($request);

        return response()->json([
            'data' => $this->paymentService->recordPayment($data)->toArray(),
        ], 201);
    }

    public function show(Payment $payment): JsonResponse
    {
        return response()->json([
            'data' => $this->paymentService->getPayment($payment)->toArray(),
        ]);
    }

    public function update(Request $request, Payment $payment): JsonResponse
    {
        $data = UpdatePaymentData::fromRequest($request);

        return response()->json([
            'data' => $this->paymentService->updatePayment($payment, $data)->toArray(),
        ]);
    }

    public function destroy(Payment $payment): JsonResponse
    {
        $this->paymentService->deletePayment($payment);

        return response()->json(null, 204);
    }
}
