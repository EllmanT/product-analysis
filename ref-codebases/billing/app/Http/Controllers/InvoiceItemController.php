<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Data\Api\StoreInvoiceItemData;
use App\Data\Api\UpdateInvoiceItemData;
use App\Models\InvoiceItem;
use App\Services\InvoiceItemService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class InvoiceItemController extends Controller
{
    public function __construct(
        private readonly InvoiceItemService $invoiceItemService,
    ) {}

    public function index(): JsonResponse
    {
        $items = $this->invoiceItemService->listInvoiceItems()
            ->map(fn ($dto) => $dto->toArray())
            ->values()
            ->all();

        return response()->json(['data' => $items]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = StoreInvoiceItemData::fromRequest($request);

        return response()->json([
            'data' => $this->invoiceItemService->createInvoiceItem($data)->toArray(),
        ], 201);
    }

    public function show(InvoiceItem $invoiceItem): JsonResponse
    {
        return response()->json([
            'data' => $this->invoiceItemService->getInvoiceItem($invoiceItem)->toArray(),
        ]);
    }

    public function update(Request $request, InvoiceItem $invoiceItem): JsonResponse
    {
        $data = UpdateInvoiceItemData::fromRequest($request);

        return response()->json([
            'data' => $this->invoiceItemService->updateInvoiceItem($invoiceItem, $data)->toArray(),
        ]);
    }

    public function destroy(InvoiceItem $invoiceItem): JsonResponse
    {
        $this->invoiceItemService->deleteInvoiceItem($invoiceItem);

        return response()->json(null, 204);
    }
}
