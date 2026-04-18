<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\InvoiceStatus;
use App\Models\Customer;
use App\Models\Invoice;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Invoice>
 */
final class InvoiceFactory extends Factory
{
    protected $model = Invoice::class;

    public function definition(): array
    {
        return [
            'customer_id' => Customer::factory(),
            'subscription_id' => null,
            'amount' => '100.00',
            'currency' => 'USD',
            'status' => InvoiceStatus::Open,
            'due_date' => now()->addDays(14)->toDateString(),
        ];
    }

    public function configure(): static
    {
        return $this->afterMaking(function (Invoice $invoice): void {
            if ($invoice->customer_id === null) {
                return;
            }

            $customer = Customer::query()->find($invoice->customer_id);
            if ($customer !== null) {
                $invoice->team_id = $customer->team_id;
            }
        });
    }
}
