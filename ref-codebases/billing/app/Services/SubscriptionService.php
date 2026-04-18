<?php

declare(strict_types=1);

namespace App\Services;

use App\Data\Api\StoreCustomerData;
use App\Data\Api\UpdateSubscriptionData;
use App\Data\CancelSubscriptionInputData;
use App\Data\CreateSubscriptionInputData;
use App\Data\RenewSubscriptionInputData;
use App\Data\SubscriptionDto;
use App\Data\TransitionSubscriptionStatusInputData;
use App\Enums\SubscriptionStatus;
use App\Events\SubscriptionActivated;
use App\Events\SubscriptionCanceled;
use App\Events\SubscriptionCreated;
use App\Events\SubscriptionRenewed;
use App\Events\SubscriptionStatusChanged;
use App\Exceptions\InvalidSubscriptionTransitionException;
use App\Models\BillingIntervalConfig;
use App\Models\Plan;
use App\Models\Subscription;
use App\Repositories\Interfaces\SubscriptionRepositoryInterface;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Event;

final class SubscriptionService
{
    public function __construct(
        private readonly SubscriptionRepositoryInterface $subscriptions,
        private readonly CustomerService $customers,
    ) {}

    public function create(CreateSubscriptionInputData $input): SubscriptionDto
    {
        $plan = Plan::query()->find($input->plan_id);
        if ($plan === null) {
            throw InvalidSubscriptionTransitionException::invalidOperation('Plan not found.');
        }

        $customerId = $input->customer_id;
        if ($customerId === null && $input->customer !== null) {
            $customerId = $this->customers->createCustomer(StoreCustomerData::from($input->customer))->id;
        }
        if ($customerId === null) {
            throw InvalidSubscriptionTransitionException::invalidOperation('Provide customer_id or a nested customer object.');
        }

        $start = CarbonImmutable::parse($input->start_date)->startOfDay();
        $now = Date::now()->toImmutable()->startOfDay();

        $trialEnd = $input->trial_end !== null
            ? CarbonImmutable::parse($input->trial_end)
            : null;

        $status = ($trialEnd !== null && $trialEnd->greaterThan($now))
            ? SubscriptionStatus::Trialing
            : SubscriptionStatus::Active;

        $endDate = $this->resolveInitialEndDate($input, $plan, $start, $status, $trialEnd);

        $attributes = [
            'customer_id' => $customerId,
            'plan_id' => $input->plan_id,
            'status' => $status,
            'start_date' => $start->toDateString(),
            'end_date' => $endDate?->toDateString(),
            'trial_end' => $trialEnd?->toIso8601String(),
            'payment_platform' => $input->payment_platform,
        ];

        $created = $this->subscriptions->create($attributes);

        Event::dispatch(new SubscriptionCreated($created));
        $this->dispatchStatusLifecycle($created, null, $created->status);

        return $this->toDto($created);
    }

    public function activate(Subscription $subscription): SubscriptionDto
    {
        $previous = $subscription->status;
        if ($previous === SubscriptionStatus::Active) {
            return $this->toDto($subscription);
        }

        $this->assertTransitionAllowed($previous, SubscriptionStatus::Active);

        $plan = $subscription->plan ?? $subscription->plan()->first();
        if ($plan === null) {
            throw InvalidSubscriptionTransitionException::invalidOperation('Subscription has no plan.');
        }

        $now = Date::now()->toImmutable()->startOfDay();
        $endDate = $subscription->end_date !== null
            ? CarbonImmutable::parse((string) $subscription->end_date)->startOfDay()
            : null;

        $updates = [
            'status' => SubscriptionStatus::Active,
        ];

        if ($endDate === null || $endDate->lessThan($now)) {
            $periodEnd = $this->computePeriodEnd($now, $plan);
            $updates['end_date'] = $periodEnd?->toDateString();
        }

        $this->subscriptions->update($subscription, $updates);
        $subscription->refresh();

        $this->dispatchStatusLifecycle($subscription, $previous, $subscription->status);

        return $this->toDto($subscription);
    }

    public function cancel(Subscription $subscription, CancelSubscriptionInputData $input): SubscriptionDto
    {
        if ($subscription->status === SubscriptionStatus::Cancelled) {
            return $this->toDto($subscription);
        }

        $this->assertTransitionAllowed($subscription->status, SubscriptionStatus::Cancelled);

        $previous = $subscription->status;
        $effectiveEnd = $input->end_date !== null
            ? CarbonImmutable::parse($input->end_date)->startOfDay()
            : Date::now()->toImmutable()->startOfDay();

        $this->subscriptions->update($subscription, [
            'status' => SubscriptionStatus::Cancelled,
            'end_date' => $effectiveEnd->toDateString(),
        ]);
        $subscription->refresh();

        $this->dispatchStatusLifecycle($subscription, $previous, $subscription->status);

        return $this->toDto($subscription);
    }

    public function renew(Subscription $subscription, ?RenewSubscriptionInputData $input = null): SubscriptionDto
    {
        if ($subscription->status === SubscriptionStatus::Trialing) {
            throw InvalidSubscriptionTransitionException::invalidOperation(
                'Cannot renew a trialing subscription; activate or cancel instead.'
            );
        }

        if ($subscription->status === SubscriptionStatus::Cancelled) {
            throw InvalidSubscriptionTransitionException::invalidOperation(
                'Cannot renew a cancelled subscription; activate or create a new subscription.'
            );
        }

        $plan = $subscription->plan ?? $subscription->plan()->first();
        if ($plan === null) {
            throw InvalidSubscriptionTransitionException::invalidOperation('Subscription has no plan.');
        }

        $previousEnd = $subscription->end_date !== null
            ? CarbonImmutable::parse((string) $subscription->end_date)->startOfDay()
            : CarbonImmutable::parse((string) $subscription->start_date)->startOfDay();

        $today = Date::now()->toImmutable()->startOfDay();
        $base = $previousEnd->max($today);

        if ($input?->new_end_date !== null) {
            $newEnd = CarbonImmutable::parse($input->new_end_date)->startOfDay();
        } else {
            $computed = $this->computePeriodEnd($base, $plan);
            if ($computed === null) {
                throw InvalidSubscriptionTransitionException::invalidOperation(
                    'One-time plans cannot be renewed automatically; provide new_end_date.'
                );
            }
            $newEnd = $computed;
        }

        $previousStatus = $subscription->status;
        $previousEndString = $subscription->end_date !== null
            ? CarbonImmutable::parse((string) $subscription->end_date)->toDateString()
            : null;

        $updates = [
            'end_date' => $newEnd->toDateString(),
        ];

        if (in_array($subscription->status, [SubscriptionStatus::Expired, SubscriptionStatus::PastDue], true)) {
            $updates['status'] = SubscriptionStatus::Active;
        }

        $this->subscriptions->update($subscription, $updates);
        $subscription->refresh();

        Event::dispatch(new SubscriptionRenewed(
            $subscription,
            $previousEndString,
            $newEnd->toDateString(),
        ));

        if ($subscription->status !== $previousStatus) {
            $this->dispatchStatusLifecycle($subscription, $previousStatus, $subscription->status);
        }

        return $this->toDto($subscription);
    }

    public function transitionStatus(
        Subscription $subscription,
        TransitionSubscriptionStatusInputData $input
    ): SubscriptionDto {
        $previous = $subscription->status;
        if ($previous === $input->status) {
            return $this->toDto($subscription);
        }

        $this->assertTransitionAllowed($previous, $input->status);

        $this->subscriptions->update($subscription, [
            'status' => $input->status,
        ]);
        $subscription->refresh();

        $this->dispatchStatusLifecycle($subscription, $previous, $subscription->status);

        return $this->toDto($subscription);
    }

    /**
     * @return Collection<int, SubscriptionDto>
     */
    public function listSubscriptions(): Collection
    {
        return $this->subscriptions->all()->map(
            fn (Subscription $subscription): SubscriptionDto => $this->toDto($subscription)
        );
    }

    public function getSubscription(Subscription $subscription): SubscriptionDto
    {
        return $this->toDto($subscription);
    }

    /**
     * @return Collection<int, SubscriptionDto>
     */
    public function getByCustomer(int $customerId): Collection
    {
        return $this->subscriptions->byCustomer($customerId)->map(
            fn (Subscription $subscription): SubscriptionDto => $this->toDto($subscription)
        );
    }

    public function updateSubscription(Subscription $subscription, UpdateSubscriptionData $data): SubscriptionDto
    {
        $this->subscriptions->update($subscription, $data->toPayload());

        return $this->toDto($subscription->refresh());
    }

    public function deleteSubscription(Subscription $subscription): void
    {
        $this->subscriptions->delete($subscription);
    }

    private function resolveInitialEndDate(
        CreateSubscriptionInputData $input,
        Plan $plan,
        CarbonImmutable $start,
        SubscriptionStatus $status,
        ?CarbonImmutable $trialEnd
    ): ?CarbonImmutable {
        if ($input->end_date !== null) {
            return CarbonImmutable::parse($input->end_date)->startOfDay();
        }

        if ($status === SubscriptionStatus::Trialing && $trialEnd !== null) {
            return $trialEnd->startOfDay();
        }

        if ($status === SubscriptionStatus::Active) {
            return $this->computePeriodEnd($start, $plan);
        }

        return null;
    }

    /**
     * Next period end for recurring plans. One-time plans have no automatic period; returns null (open-ended until cancelled or manual end).
     */
    private function computePeriodEnd(CarbonImmutable $start, Plan $plan): ?CarbonImmutable
    {
        $config = BillingIntervalConfig::withoutGlobalScopes()
            ->where('team_id', $plan->team_id)
            ->where('value', $plan->billing_interval)
            ->first();

        if ($config === null || ! $config->is_recurring || $config->interval_count === null || $config->interval_unit === null) {
            return null;
        }

        return match ($config->interval_unit) {
            'day' => $start->addDays($config->interval_count),
            'week' => $start->addWeeks($config->interval_count),
            'month' => $start->addMonths($config->interval_count),
            'year' => $start->addYears($config->interval_count),
            default => null,
        };
    }

    private function assertTransitionAllowed(SubscriptionStatus $from, SubscriptionStatus $to): void
    {
        if ($from === $to) {
            return;
        }

        $allowed = match ($from) {
            SubscriptionStatus::Trialing => [
                SubscriptionStatus::Active,
                SubscriptionStatus::Cancelled,
                SubscriptionStatus::Expired,
                SubscriptionStatus::PastDue,
            ],
            SubscriptionStatus::Active => [
                SubscriptionStatus::PastDue,
                SubscriptionStatus::Cancelled,
                SubscriptionStatus::Expired,
            ],
            SubscriptionStatus::PastDue => [
                SubscriptionStatus::Active,
                SubscriptionStatus::Cancelled,
                SubscriptionStatus::Expired,
            ],
            SubscriptionStatus::Cancelled => [
                SubscriptionStatus::Active,
                SubscriptionStatus::Expired,
            ],
            SubscriptionStatus::Expired => [
                SubscriptionStatus::Active,
                SubscriptionStatus::Cancelled,
            ],
        };

        if (! in_array($to, $allowed, true)) {
            throw InvalidSubscriptionTransitionException::fromStatuses($from, $to);
        }
    }

    private function dispatchStatusLifecycle(
        Subscription $subscription,
        ?SubscriptionStatus $previous,
        SubscriptionStatus $current
    ): void {
        if ($previous === $current) {
            return;
        }

        Event::dispatch(new SubscriptionStatusChanged($subscription, $previous, $current));

        if ($current === SubscriptionStatus::Active && $previous !== SubscriptionStatus::Active) {
            Event::dispatch(new SubscriptionActivated($subscription));
        }

        if ($current === SubscriptionStatus::Cancelled && $previous !== SubscriptionStatus::Cancelled) {
            Event::dispatch(new SubscriptionCanceled($subscription));
        }
    }

    private function toDto(Subscription $subscription): SubscriptionDto
    {
        return SubscriptionDto::from($subscription->loadMissing(['customer', 'plan.product']));
    }
}
