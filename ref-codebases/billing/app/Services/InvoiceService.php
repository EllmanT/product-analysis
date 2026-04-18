<?php

declare(strict_types=1);

namespace App\Services;

use App\Data\Api\StoreInvoiceData;
use App\Data\Api\UpdateInvoiceData;
use App\Data\GenerateInvoiceFromSubscriptionInputData;
use App\Data\InvoiceDto;
use App\Enums\InvoiceGeneratedSource;
use App\Enums\SubscriptionStatus;
use App\Events\InvoiceGenerated;
use App\Exceptions\InvoiceGenerationException;
use App\Models\BillingIntervalConfig;
use App\Models\Invoice;
use App\Models\Plan;
use App\Models\Subscription;
use App\Repositories\Interfaces\InvoiceItemRepositoryInterface;
use App\Repositories\Interfaces\InvoiceRepositoryInterface;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

final class InvoiceService
{
    public function __construct(
        private readonly InvoiceRepositoryInterface $invoices,
        private readonly InvoiceItemRepositoryInterface $invoiceItems,
    ) {}

    /**
     * Builds an invoice from a subscription’s plan: one line item for the plan price,
     * invoice amount = sum of line totals, due date from issue date + terms or explicit due date.
     */
    public function generateFromSubscription(
        Subscription $subscription,
        ?GenerateInvoiceFromSubscriptionInputData $input = null
    ): InvoiceDto {
        $input ??= new GenerateInvoiceFromSubscriptionInputData;

        $subscription->loadMissing(['plan.product', 'customer']);

        $this->assertBillableSubscription($subscription);

        $plan = $subscription->plan;
        if ($plan === null) {
            throw InvoiceGenerationException::fromMessage('Subscription has no plan.');
        }

        $lines = $this->buildLineItemsFromPlan($plan);

        $invoiceTotal = $this->sumLineTotals($lines);

        $issueDate = CarbonImmutable::parse($input->issue_date ?? Date::now()->toDateString())->startOfDay();
        $dueDate = $this->resolveDueDate($input, $issueDate);

        if ($dueDate->lessThan($issueDate)) {
            throw InvoiceGenerationException::fromMessage('Due date cannot be before the issue date.');
        }

        return DB::transaction(function () use ($subscription, $input, $invoiceTotal, $plan, $lines, $dueDate): InvoiceDto {
            $invoice = $this->invoices->create([
                'team_id' => $subscription->team_id,
                'customer_id' => $subscription->customer_id,
                'subscription_id' => $subscription->id,
                'amount' => $invoiceTotal,
                'currency' => strtoupper($plan->currency),
                'status' => $input->status,
                'due_date' => $dueDate->toDateString(),
            ]);

            foreach ($lines as $line) {
                $this->invoiceItems->create([
                    'invoice_id' => $invoice->id,
                    'description' => $line['description'],
                    'quantity' => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'total' => $line['total'],
                ]);
            }

            $invoice->refresh();

            Event::dispatch(new InvoiceGenerated($invoice, InvoiceGeneratedSource::Subscription));

            return $this->toDto($invoice);
        });
    }

    /**
     * @return Collection<int, InvoiceDto>
     */
    public function listInvoices(): Collection
    {
        return $this->invoices->all()->map(
            fn (Invoice $invoice): InvoiceDto => $this->toDto($invoice)
        );
    }

    public function getInvoice(Invoice $invoice): InvoiceDto
    {
        return $this->toDto($invoice);
    }

    public function createManualInvoice(StoreInvoiceData $data): InvoiceDto
    {
        $created = $this->invoices->create($data->toRepositoryArray());

        Event::dispatch(new InvoiceGenerated($created, InvoiceGeneratedSource::Manual));

        return $this->toDto($created);
    }

    public function updateInvoice(Invoice $invoice, UpdateInvoiceData $data): InvoiceDto
    {
        $this->invoices->update($invoice, $data->toPayload());

        return $this->toDto($invoice->refresh());
    }

    public function deleteInvoice(Invoice $invoice): void
    {
        $this->invoices->delete($invoice);
    }

    /**
     * @return array<int, array{description: string, quantity: int, unit_price: string, total: string}>
     */
    private function buildLineItemsFromPlan(Plan $plan): array
    {
        $unitPrice = $this->normalizeMoney((string) $plan->price);
        $quantity = 1;
        $total = $this->multiplyMoney($unitPrice, (string) $quantity);

        $config = BillingIntervalConfig::withoutGlobalScopes()
            ->where('team_id', $plan->team_id)
            ->where('value', $plan->billing_interval)
            ->first();

        $intervalLabel = $config !== null ? strtolower($config->label) : str_replace('_', '-', (string) $plan->billing_interval);

        $product = $plan->relationLoaded('product') ? $plan->product : null;
        $label = $product !== null
            ? sprintf('%s — %s (%s)', $product->name, $plan->name, $intervalLabel)
            : sprintf('%s (%s)', $plan->name, $intervalLabel);

        return [
            [
                'description' => $label,
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'total' => $total,
            ],
        ];
    }

    /**
     * @param  array<int, array{description: string, quantity: int, unit_price: string, total: string}>  $lines
     */
    private function sumLineTotals(array $lines): string
    {
        $sum = '0.00';
        foreach ($lines as $line) {
            $sum = $this->addMoney($sum, $line['total']);
        }

        return $sum;
    }

    private function resolveDueDate(
        GenerateInvoiceFromSubscriptionInputData $input,
        CarbonImmutable $issueDate
    ): CarbonImmutable {
        if ($input->due_date !== null) {
            return CarbonImmutable::parse($input->due_date)->startOfDay();
        }

        return $issueDate->addDays($input->days_until_due);
    }

    private function assertBillableSubscription(Subscription $subscription): void
    {
        if (! in_array($subscription->status, [
            SubscriptionStatus::Active,
            SubscriptionStatus::Trialing,
            SubscriptionStatus::PastDue,
        ], true)) {
            throw InvoiceGenerationException::fromMessage(
                'Invoices can only be generated for active, trialing, or past due subscriptions.'
            );
        }
    }

    private function toDto(Invoice $invoice): InvoiceDto
    {
        return InvoiceDto::from($invoice->loadMissing([
            'customer',
            'subscription.customer',
            'subscription.plan',
        ]));
    }

    private function normalizeMoney(string $value): string
    {
        return number_format((float) $value, 2, '.', '');
    }

    private function addMoney(string $a, string $b): string
    {
        $a = $this->normalizeMoney($a);
        $b = $this->normalizeMoney($b);

        if (function_exists('bcadd')) {
            return $this->normalizeMoney(bcadd($a, $b, 2));
        }

        return $this->normalizeMoney((string) ((float) $a + (float) $b));
    }

    private function multiplyMoney(string $a, string $b): string
    {
        $a = $this->normalizeMoney($a);
        $b = $this->normalizeMoney($b);

        if (function_exists('bcmul')) {
            return $this->normalizeMoney(bcmul($a, $b, 2));
        }

        return $this->normalizeMoney((string) ((float) $a * (float) $b));
    }
}
