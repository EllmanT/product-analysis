<?php

declare(strict_types=1);

namespace App\Services;

use App\Data\Api\StoreInvoiceData;
use App\Data\CreateCheckoutSessionInputData;
use App\Data\CreateSubscriptionInputData;
use App\Enums\InvoiceStatus;
use App\Models\CheckoutSession;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Plan;
use App\Models\Subscription;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Str;
use RuntimeException;

final class CheckoutSessionService
{
    public function __construct(
        private readonly InvoiceService $invoices,
        private readonly SubscriptionService $subscriptions,
    ) {}

    public function create(CreateCheckoutSessionInputData $input): CheckoutSession
    {
        $teamId = (int) (request()->attributes->get('tenant_id') ?? 0);
        if ($teamId === 0) {
            throw new RuntimeException('Tenant context missing.');
        }

        /** @var Plan|null $plan */
        $plan = Plan::query()->find($input->plan_id);
        if ($plan === null) {
            throw new RuntimeException('Plan not found.');
        }

        return DB::transaction(function () use ($input, $teamId, $plan): CheckoutSession {
            $customerId = $input->customer_id;

            if ($customerId === null && $input->customer !== null) {
                $created = Customer::create([
                    'team_id' => $teamId,
                    'name' => $input->customer['name'],
                    'email' => $input->customer['email'] ?? null,
                ]);

                $customerId = $created->id;
            }

            if ($customerId === null) {
                throw new RuntimeException('Provide customer_id or customer details.');
            }

            /** @var Customer $customer */
            $customer = Customer::query()->findOrFail($customerId);

            $invoiceDto = $this->invoices->createManualInvoice(StoreInvoiceData::from([
                'customer_id' => $customer->id,
                'subscription_id' => null,
                'amount' => (string) $plan->price,
                'currency' => $plan->currency,
                'status' => InvoiceStatus::Open,
                'due_date' => now()->toDateString(),
            ]));

            $invoiceModel = Invoice::withoutGlobalScopes()->findOrFail($invoiceDto->id);

            $session = CheckoutSession::create([
                'team_id' => $teamId,
                'plan_id' => $plan->id,
                'customer_id' => $customer->id,
                'invoice_id' => $invoiceModel->id,
                'public_id' => (string) Str::uuid(),
                'callback_url' => $input->callback_url,
                'external_reference' => $input->external_reference,
                'status' => 'open',
                'metadata' => $input->metadata,
            ]);

            $invoiceModel->update(['checkout_session_id' => $session->id]);

            // Zero-amount checkouts cannot be processed by payment providers; finalize immediately.
            if ((float) $invoiceModel->amount <= 0.0) {
                $invoiceModel->update(['status' => InvoiceStatus::Paid]);

                $session->payment_platform = 'free';
                $session->status = 'succeeded';
                $session->completed_at = now();
                $session->save();

                $this->ensureSubscriptionForSucceededSession($session);
            }

            return $session->refresh();
        });
    }

    /**
     * Ensure a subscription exists for a paid checkout session and link it to the invoice.
     * Safe to call multiple times.
     */
    public function ensureSubscriptionForSucceededSession(CheckoutSession $session): ?Subscription
    {
        if ($session->status !== 'succeeded') {
            return null;
        }

        if ($session->subscription_id !== null) {
            return Subscription::query()->find($session->subscription_id);
        }

        // Ensure tenant scoping works inside this call
        request()->attributes->set('tenant_id', $session->team_id);

        $trialEnd = null;
        $plan = Plan::withoutGlobalScopes()->find($session->plan_id);
        $trialDays = $plan?->trial_days;
        if (is_int($trialDays) && $trialDays > 0) {
            $trialEnd = CarbonImmutable::parse(Date::now()->toDateString())
                ->addDays($trialDays)
                ->toDateString();
        }

        $sub = $this->subscriptions->create(CreateSubscriptionInputData::from([
            'customer_id' => $session->customer_id,
            'plan_id' => $session->plan_id,
            'start_date' => now()->toDateString(),
            'trial_end' => $trialEnd,
            'payment_platform' => $session->payment_platform,
        ]));

        $subModel = Subscription::withoutGlobalScopes()->findOrFail($sub->id);

        Invoice::withoutGlobalScopes()
            ->where('id', $session->invoice_id)
            ->update(['subscription_id' => $subModel->id]);

        $session->update(['subscription_id' => $subModel->id]);

        return $subModel;
    }
}
