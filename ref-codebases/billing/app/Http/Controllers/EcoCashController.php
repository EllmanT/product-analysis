<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Services\EcoCashService;
use App\Services\ExceptionReporter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

final class EcoCashController extends Controller
{
    public function __construct(
        private readonly EcoCashService $ecocash,
        private readonly ExceptionReporter $exceptions,
    ) {}

    /**
     * Initiate an EcoCash debit push for an invoice.
     *
     * POST /ecocash/initiate
     * Body: { invoice_id, phone_number, currency? }
     */
    public function initiate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'invoice_id' => ['required', 'integer', 'exists:invoices,id'],
            'phone_number' => ['required', 'string', 'max:20'],
            'currency' => ['sometimes', 'nullable', 'string', 'max:10'],
        ]);

        /** @var Invoice $invoice */
        $invoice = Invoice::query()->findOrFail($validated['invoice_id']);

        try {
            $result = $this->ecocash->initiatePayment(
                $invoice,
                $validated['phone_number'],
                $validated['currency'] ?? null,
            );

            return response()->json([
                'message' => 'EcoCash payment initiated. Please approve the request on your phone.',
                'reference_code' => $result['reference_code'],
                'client_correlator' => $result['client_correlator'],
                'local_amount' => $result['local_amount'],
                'local_currency' => $result['local_currency'],
                'ecocash_status' => $result['ecocash_status'],
            ]);
        } catch (Throwable $e) {
            $this->exceptions->report($e, [
                'ecocash' => [
                    'invoice_id' => $invoice->id,
                ],
            ]);

            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Receive EcoCash payment notification (server-to-server webhook).
     *
     * POST /api/ecocash/notify  (public — no session auth, no CSRF)
     */
    public function notify(Request $request): JsonResponse
    {
        $this->ecocash->handleNotification($request->all(), $request->getContent());

        return response()->json(['status' => 'ok']);
    }

    /**
     * Poll the status of an EcoCash transaction by its reference code.
     *
     * GET /ecocash/status/{referenceCode}
     */
    public function status(string $referenceCode): JsonResponse
    {
        $txn = $this->ecocash->getTransaction($referenceCode);

        if ($txn === null) {
            return response()->json(['message' => 'Transaction not found.'], 404);
        }

        return response()->json([
            'reference_code' => $txn->reference_code,
            'status' => $txn->status->value,
            'local_amount' => (string) $txn->local_amount,
            'local_currency' => $txn->local_currency,
            'completed_at' => $txn->completed_at?->toIso8601String(),
            'payment_id' => $txn->payment_id,
            'invoice_id' => $txn->invoice_id,
        ]);
    }
}
