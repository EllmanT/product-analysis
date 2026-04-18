<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Data\Api\StoreInvoiceData;
use App\Data\Api\UpdateInvoiceData;
use App\Data\GenerateInvoiceFromSubscriptionInputData;
use App\Data\InvoiceDto;
use App\Exceptions\InvoiceGenerationException;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Subscription;
use App\Services\InvoiceService;
use App\Support\InvoiceDocumentBranding;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Illuminate\View\View;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

final class InvoiceController extends Controller
{
    public function __construct(
        private readonly InvoiceService $invoiceService,
    ) {}

    public function index(Request $request): InertiaResponse
    {
        $q = trim((string) $request->query('q', ''));
        $perPage = max(5, min(100, (int) $request->query('per_page', 10)));

        $query = Invoice::query()->with(['customer', 'subscription'])->orderByDesc('id');
        if ($q !== '') {
            $needle = mb_strtolower($q);
            $like = '%'.$needle.'%';
            $query->where(function ($qb) use ($like): void {
                $qb->whereRaw('LOWER(CAST(invoices.amount AS CHAR)) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(COALESCE(invoices.currency, \'\')) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(invoices.status) LIKE ?', [$like])
                    ->orWhereHas('customer', function ($c) use ($like): void {
                        $c->whereRaw('LOWER(name) LIKE ?', [$like]);
                    });
            });
        }

        $p = $query->paginate($perPage)->withQueryString();
        $p->setCollection(
            $p->getCollection()->map(
                fn (Invoice $invoice) => InvoiceDto::from($invoice)->toArray()
            )
        );

        return Inertia::render('invoices/Index', [
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
        $data = StoreInvoiceData::fromRequest($request);

        return response()->json([
            'data' => $this->invoiceService->createManualInvoice($data)->toArray(),
        ], 201);
    }

    public function storeFromSubscription(Request $request, Subscription $subscription): JsonResponse
    {
        try {
            $input = GenerateInvoiceFromSubscriptionInputData::fromRequest($request);

            return response()->json([
                'data' => $this->invoiceService->generateFromSubscription($subscription, $input)->toArray(),
            ], 201);
        } catch (InvoiceGenerationException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function show(Request $request, Invoice $invoice): JsonResponse|RedirectResponse
    {
        if ($request->wantsJson()) {
            return response()->json([
                'data' => $this->invoiceService->getInvoice($invoice)->toArray(),
            ]);
        }

        return redirect()->route('invoices.document', $invoice);
    }

    public function document(Invoice $invoice): View
    {
        return view('invoices.document', $this->documentPayload($invoice));
    }

    public function download(Invoice $invoice): Response
    {
        $payload = $this->documentPayload($invoice);
        $invoiceModel = $payload['invoice'];

        return Pdf::loadView('invoices.document', $payload)
            ->setPaper('a4', 'portrait')
            ->download(sprintf('invoice-%d.pdf', $invoiceModel->id));
    }

    /**
     * @return array{
     *     invoice: Invoice,
     *     lines: Collection<int, InvoiceItem>|Collection<int, object>,
     *     branding: array{
     *         logo_data_uri: string|null,
     *         issuer_name: string,
     *         issuer_lines: list<string>,
     *         payment_options: list<array{label: string, detail: string, logo_data_uri: string|null}>
     *     }
     * }
     */
    private function documentPayload(Invoice $invoice): array
    {
        $invoice->loadMissing([
            'team',
            'customer',
            'subscription.plan.product',
            'checkoutSession.plan.product',
            'invoiceItems' => fn ($query) => $query->orderBy('id'),
        ]);

        $lines = $invoice->invoiceItems;
        if ($lines->isEmpty()) {
            $lines = new Collection([
                (object) [
                    'description' => $this->fallbackInvoiceLineDescription($invoice),
                    'quantity' => 1,
                    'unit_price' => (string) $invoice->amount,
                    'total' => (string) $invoice->amount,
                ],
            ]);
        }

        return [
            'invoice' => $invoice,
            'lines' => $lines,
            'branding' => InvoiceDocumentBranding::forInvoice($invoice),
        ];
    }

    /**
     * When an invoice has no line items (e.g. checkout-created invoice), show product — plan
     * to match subscription-generated invoices.
     */
    private function fallbackInvoiceLineDescription(Invoice $invoice): string
    {
        $subscription = $invoice->subscription;
        if ($subscription !== null) {
            $plan = $subscription->plan;
            if ($plan !== null) {
                $product = $plan->product;
                if ($product !== null) {
                    return sprintf('%s — %s', $product->name, $plan->name);
                }

                return (string) $plan->name;
            }
        }

        $session = $invoice->checkoutSession;
        if ($session !== null) {
            $plan = $session->plan;
            if ($plan !== null) {
                $product = $plan->product;
                if ($product !== null) {
                    return sprintf('%s — %s', $product->name, $plan->name);
                }

                return (string) $plan->name;
            }
        }

        return 'Invoice total';
    }

    public function update(Request $request, Invoice $invoice): JsonResponse
    {
        $data = UpdateInvoiceData::fromRequest($request);

        return response()->json([
            'data' => $this->invoiceService->updateInvoice($invoice, $data)->toArray(),
        ]);
    }

    public function destroy(Invoice $invoice): JsonResponse
    {
        $this->invoiceService->deleteInvoice($invoice);

        return response()->json(null, 204);
    }
}
