<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\SubscriptionStatus;
use App\Models\Customer;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\Team;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Subscription>
 */
final class SubscriptionFactory extends Factory
{
    protected $model = Subscription::class;

    public function definition(): array
    {
        return [
            'team_id' => Team::factory(),
            'customer_id' => Customer::factory(),
            'plan_id' => Plan::factory(),
            'status' => SubscriptionStatus::Active,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
            'trial_end' => null,
        ];
    }
}
