<?php

declare(strict_types=1);

namespace App\Services;

use App\Data\Api\StoreInvoiceItemData;
use App\Data\Api\UpdateInvoiceItemData;
use App\Data\InvoiceItemDto;
use App\Models\InvoiceItem;
use App\Repositories\Interfaces\InvoiceItemRepositoryInterface;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

final class InvoiceItemService
{
    public function __construct(
        private readonly InvoiceItemRepositoryInterface $invoiceItems,
    ) {}

    /**
     * @return Collection<int, InvoiceItemDto>
     */
    public function listInvoiceItems(): Collection
    {
        return $this->invoiceItems->all()->map(
            fn (InvoiceItem $item): InvoiceItemDto => InvoiceItemDto::from($item)
        );
    }

    public function getInvoiceItem(InvoiceItem $invoiceItem): InvoiceItemDto
    {
        return InvoiceItemDto::from($invoiceItem->loadMissing('invoice'));
    }

    public function createInvoiceItem(StoreInvoiceItemData $data): InvoiceItemDto
    {
        $attrs = $data->toRepositoryArray();
        $this->assertTotalMatchesLine($attrs);

        $created = $this->invoiceItems->create($attrs);

        return InvoiceItemDto::from($created->loadMissing('invoice'));
    }

    public function updateInvoiceItem(InvoiceItem $invoiceItem, UpdateInvoiceItemData $data): InvoiceItemDto
    {
        $payload = $data->toPayload();

        $merged = [
            'quantity' => (int) ($payload['quantity'] ?? $invoiceItem->quantity),
            'unit_price' => (float) ($payload['unit_price'] ?? $invoiceItem->unit_price),
            'total' => (float) ($payload['total'] ?? $invoiceItem->total),
        ];
        if (! array_key_exists('total', $payload)
            && (array_key_exists('quantity', $payload) || array_key_exists('unit_price', $payload))) {
            $merged['total'] = round($merged['quantity'] * $merged['unit_price'], 2);
            $payload['total'] = number_format($merged['total'], 2, '.', '');
        }
        $this->assertTotalMatchesLine($merged);

        $this->invoiceItems->update($invoiceItem, $payload);

        return InvoiceItemDto::from($invoiceItem->refresh()->loadMissing('invoice'));
    }

    public function deleteInvoiceItem(InvoiceItem $invoiceItem): void
    {
        $this->invoiceItems->delete($invoiceItem);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function assertTotalMatchesLine(array $data): void
    {
        $qty = (float) ($data['quantity'] ?? 0);
        $unit = (float) ($data['unit_price'] ?? 0);
        $total = (float) ($data['total'] ?? 0);
        $expected = round($qty * $unit, 2);

        if (abs($total - $expected) > 0.01) {
            throw ValidationException::withMessages([
                'total' => ['Total must equal quantity × unit_price (rounded to 2 decimal places).'],
            ]);
        }
    }
}
