<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Invoice;
use App\Models\InvoiceItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<InvoiceItem>
 */
final class InvoiceItemFactory extends Factory
{
    protected $model = InvoiceItem::class;

    public function definition(): array
    {
        return [
            'invoice_id' => Invoice::factory(),
            'description' => fake()->sentence(),
            'quantity' => 1,
            'unit_price' => '10.00',
            'total' => '10.00',
        ];
    }

    public function configure(): static
    {
        return $this->afterMaking(function (InvoiceItem $item): void {
            if ($item->invoice_id === null) {
                return;
            }

            $invoice = Invoice::query()->find($item->invoice_id);
            if ($invoice !== null) {
                $item->team_id = $invoice->team_id;
            }
        });
    }
}
