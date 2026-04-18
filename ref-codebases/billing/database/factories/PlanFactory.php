<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\BillingInterval;
use App\Models\Plan;
use App\Models\Product;
use App\Models\Team;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Plan>
 */
final class PlanFactory extends Factory
{
    protected $model = Plan::class;

    public function definition(): array
    {
        return [
            'team_id' => Team::factory(),
            'product_id' => Product::factory(),
            'name' => fake()->words(2, true),
            'billing_interval' => BillingInterval::Monthly,
            'price' => '10.00',
            'currency' => 'USD',
            'trial_days' => null,
        ];
    }

    public function forProduct(Product $product): static
    {
        return $this->state(fn (): array => [
            'team_id' => $product->team_id,
            'product_id' => $product->id,
        ]);
    }
}
