<?php

declare(strict_types=1);

use App\Enums\BillingInterval;
use App\Models\Customer;
use App\Models\Plan;
use App\Models\Product;
use App\Models\Team;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Billing interval validation and subscription period math require rows in `billing_interval_configs`
 * per team. The migration only seeds teams that exist at migrate time; tests create teams later.
 */
function seedDefaultBillingIntervalsForTeam(Team $team): void
{
    $defaults = [
        ['label' => 'One-time', 'value' => 'one_time', 'is_recurring' => false, 'interval_count' => null, 'interval_unit' => null, 'sort_order' => 0],
        ['label' => 'Monthly (recurring)', 'value' => 'monthly', 'is_recurring' => true, 'interval_count' => 1, 'interval_unit' => 'month', 'sort_order' => 1],
        ['label' => 'Yearly (recurring)', 'value' => 'yearly', 'is_recurring' => true, 'interval_count' => 12, 'interval_unit' => 'month', 'sort_order' => 2],
    ];
    $now = now();
    foreach ($defaults as $row) {
        DB::table('billing_interval_configs')->insertOrIgnore([
            ...$row,
            'team_id' => $team->id,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }
}

/**
 * @return object{team: Team, user: User, customer: Customer, product: Product, plan: Plan}
 */
function billingFixture(): object
{
    $team = Team::factory()->create();
    seedDefaultBillingIntervalsForTeam($team);
    $user = User::factory()->create(['team_id' => $team->id]);
    $customer = Customer::factory()->create(['team_id' => $team->id]);
    $product = Product::factory()->create(['team_id' => $team->id]);
    $plan = Plan::factory()->forProduct($product)->create([
        'name' => 'Monthly',
        'billing_interval' => BillingInterval::Monthly,
        'price' => '50.00',
        'currency' => 'USD',
    ]);

    return (object) compact('team', 'user', 'customer', 'product', 'plan');
}
