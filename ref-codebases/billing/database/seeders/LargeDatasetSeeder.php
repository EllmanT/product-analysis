<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\BillingInterval;
use App\Enums\EcocashTransactionStatus;
use App\Enums\InvoiceStatus;
use App\Enums\PaymentStatus;
use App\Enums\SubscriptionStatus;
use App\Models\Team;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Console\Helper\ProgressBar;

/**
 * Bulk data for load / pagination testing. Defaults target **team_id = 1** (override with SEED_TEAM_ID).
 *
 * Inserts: customers, products, plans, subscriptions, invoices, payments, ecocash_transactions.
 * Uses chunked `DB::table()` inserts (no model events) for speed.
 *
 * Prerequisites: `php artisan migrate` and ideally `php artisan db:seed` so team 1 + billing user exist.
 *
 *   php artisan db:seed --class=LargeDatasetSeeder
 *
 * Env (defaults in parentheses):
 *
 *   SEED_TEAM_ID (1)
 *   SEED_CUSTOMER_COUNT (10000)
 *   SEED_PRODUCT_COUNT (25)
 *   SEED_PLAN_COUNT (150)
 *   SEED_SUBSCRIPTION_COUNT (8000)
 *   SEED_INVOICE_COUNT (8000)
 *   SEED_PAYMENT_COUNT (6000)
 *   SEED_ECOCASH_COUNT (2000)
 */
final class LargeDatasetSeeder extends Seeder
{
    private const CHUNK = 500;

    private int $teamId = 1;

    public function run(): void
    {
        $this->teamId = max(1, (int) env('SEED_TEAM_ID', 1));

        if (Team::query()->whereKey($this->teamId)->doesntExist()) {
            $this->command?->error("Team id {$this->teamId} does not exist. Run `php artisan db:seed` first (or create that team).");

            return;
        }

        $this->seedBillingIntervals();
        $this->info('Billing intervals OK.');

        $this->seedProducts();
        $this->seedPlans();

        $this->seedCustomers();

        $productIds = $this->idsForTeam('products');
        $planIds = $this->idsForTeam('plans');
        $customerIds = $this->idsForTeam('customers');

        if ($planIds === [] || $customerIds === []) {
            $this->command?->error('Need at least one plan and one customer for subscriptions.');

            return;
        }

        $this->seedSubscriptions($planIds, $customerIds);
        $this->seedInvoices($customerIds);
        $invoiceIds = $this->idsForTeam('invoices');
        $this->seedPayments($invoiceIds);
        $this->seedEcocashTransactions($invoiceIds);

        $this->command?->info("Done. All rows use team_id={$this->teamId}.");
    }

    private function info(string $message): void
    {
        $this->command?->info($message);
    }

    /**
     * @return list<int>
     */
    private function idsForTeam(string $table): array
    {
        return DB::table($table)
            ->where('team_id', $this->teamId)
            ->orderBy('id')
            ->pluck('id')
            ->map(fn ($id): int => (int) $id)
            ->all();
    }

    private function seedBillingIntervals(): void
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
                'team_id' => $this->teamId,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    private function seedProducts(): void
    {
        $count = $this->clampCount((int) env('SEED_PRODUCT_COUNT', 25));
        $existing = (int) DB::table('products')->where('team_id', $this->teamId)->count();
        $now = now();
        $batch = [];
        $bar = $this->command?->getOutput()->createProgressBar($count);
        $bar?->start();

        for ($k = 1; $k <= $count; $k++) {
            $n = $existing + $k;
            $batch[] = [
                'team_id' => $this->teamId,
                'name' => 'Bulk Product '.$n,
                'description' => 'Seeded catalog item '.$n,
                'created_at' => $now,
                'updated_at' => $now,
            ];
            $this->flushBatch('products', $batch, $bar);
        }
        $this->flushBatch('products', $batch, $bar, true);
        $bar?->finish();
        $this->command?->newLine();
        $this->info("Inserted {$count} products.");
    }

    private function seedPlans(): void
    {
        $count = $this->clampCount((int) env('SEED_PLAN_COUNT', 150));
        $productIds = $this->idsForTeam('products');
        if ($productIds === []) {
            $this->command?->warn('No products for team; skipping plans.');

            return;
        }

        $intervals = [
            BillingInterval::OneTime->value,
            BillingInterval::Monthly->value,
            BillingInterval::Yearly->value,
        ];
        $platformsJson = json_encode(['ecocash', 'omari', 'zimswitch'], JSON_THROW_ON_ERROR);

        $existing = (int) DB::table('plans')->where('team_id', $this->teamId)->count();
        $now = now();
        $batch = [];
        $bar = $this->command?->getOutput()->createProgressBar($count);
        $bar?->start();

        for ($k = 1; $k <= $count; $k++) {
            $n = $existing + $k;
            $productId = $productIds[($k - 1) % count($productIds)];
            $interval = $intervals[$k % count($intervals)];
            $price = number_format(5 + ($k % 200) + ($k % 100) / 100, 2, '.', '');

            $batch[] = [
                'team_id' => $this->teamId,
                'product_id' => $productId,
                'name' => 'Bulk Plan '.$n,
                'billing_interval' => $interval,
                'price' => $price,
                'currency' => 'USD',
                'payment_platforms' => $platformsJson,
                'created_at' => $now,
                'updated_at' => $now,
            ];
            $this->flushBatch('plans', $batch, $bar);
        }
        $this->flushBatch('plans', $batch, $bar, true);
        $bar?->finish();
        $this->command?->newLine();
        $this->info("Inserted {$count} plans.");
    }

    private function seedCustomers(): void
    {
        $count = $this->clampCount((int) env('SEED_CUSTOMER_COUNT', 10_000));
        $existing = (int) DB::table('customers')->where('team_id', $this->teamId)->count();
        $now = now();
        $batch = [];
        $bar = $this->command?->getOutput()->createProgressBar($count);
        $bar?->start();

        for ($k = 1; $k <= $count; $k++) {
            $n = $existing + $k;
            $batch[] = [
                'team_id' => $this->teamId,
                'name' => 'Bulk Customer '.$n,
                'email' => 'bulk-seed-'.$this->teamId.'-'.$n.'@seed.local',
                'created_at' => $now,
                'updated_at' => $now,
            ];
            $this->flushBatch('customers', $batch, $bar);
        }
        $this->flushBatch('customers', $batch, $bar, true);
        $bar?->finish();
        $this->command?->newLine();
        $this->info("Inserted {$count} customers.");
    }

    /**
     * @param  list<int>  $planIds
     * @param  list<int>  $customerIds
     */
    private function seedSubscriptions(array $planIds, array $customerIds): void
    {
        $count = $this->clampCount((int) env('SEED_SUBSCRIPTION_COUNT', 8000));
        $maxC = count($customerIds) - 1;
        $maxP = count($planIds) - 1;

        $statuses = [
            SubscriptionStatus::Active,
            SubscriptionStatus::Trialing,
            SubscriptionStatus::PastDue,
            SubscriptionStatus::Cancelled,
            SubscriptionStatus::Expired,
        ];
        $platforms = ['ecocash', 'omari', 'zimswitch', null];

        $now = now();
        $batch = [];
        $bar = $this->command?->getOutput()->createProgressBar($count);
        $bar?->start();

        for ($i = 0; $i < $count; $i++) {
            $customerId = $customerIds[random_int(0, $maxC)];
            $planId = $planIds[random_int(0, $maxP)];
            $status = $statuses[$i % count($statuses)];
            $start = CarbonImmutable::now()->subDays($i % 400)->toDateString();
            $end = match ($status) {
                SubscriptionStatus::Active, SubscriptionStatus::Trialing => CarbonImmutable::parse($start)->addYear()->toDateString(),
                SubscriptionStatus::Expired, SubscriptionStatus::Cancelled => CarbonImmutable::parse($start)->addMonths(3)->toDateString(),
                default => CarbonImmutable::parse($start)->addMonth()->toDateString(),
            };
            if ($i % 7 === 0) {
                $end = null;
            }

            $batch[] = [
                'team_id' => $this->teamId,
                'customer_id' => $customerId,
                'plan_id' => $planId,
                'status' => $status->value,
                'start_date' => $start,
                'end_date' => $end,
                'trial_end' => $i % 11 === 0 ? $now : null,
                'payment_platform' => $platforms[$i % count($platforms)],
                'created_at' => $now,
                'updated_at' => $now,
            ];
            $this->flushBatch('subscriptions', $batch, $bar);
        }
        $this->flushBatch('subscriptions', $batch, $bar, true);
        $bar?->finish();
        $this->command?->newLine();
        $this->info("Inserted {$count} subscriptions.");
    }

    /**
     * @param  list<int>  $customerIds
     */
    private function seedInvoices(array $customerIds): void
    {
        $count = $this->clampCount((int) env('SEED_INVOICE_COUNT', 8000));
        $maxC = count($customerIds) - 1;
        $statuses = [
            InvoiceStatus::Draft->value,
            InvoiceStatus::Open->value,
            InvoiceStatus::Overdue->value,
            InvoiceStatus::Paid->value,
            InvoiceStatus::Void->value,
            InvoiceStatus::Uncollectible->value,
        ];

        $now = now();
        $batch = [];
        $bar = $this->command?->getOutput()->createProgressBar($count);
        $bar?->start();

        for ($i = 0; $i < $count; $i++) {
            $customerId = $customerIds[random_int(0, $maxC)];
            // Keep nullable — linking a random subscription often mismatches customer_id.
            $subscriptionId = null;
            $amount = number_format(25 + ($i % 500) + ($i % 50) / 100, 2, '.', '');
            $status = $statuses[$i % count($statuses)];
            $due = CarbonImmutable::now()->addDays(($i % 60) - 30)->toDateString();

            $batch[] = [
                'team_id' => $this->teamId,
                'customer_id' => $customerId,
                'subscription_id' => $subscriptionId,
                'amount' => $amount,
                'currency' => 'USD',
                'status' => $status,
                'due_date' => $due,
                'created_at' => $now,
                'updated_at' => $now,
            ];
            $this->flushBatch('invoices', $batch, $bar);
        }
        $this->flushBatch('invoices', $batch, $bar, true);
        $bar?->finish();
        $this->command?->newLine();
        $this->info("Inserted {$count} invoices.");
    }

    /**
     * @param  list<int>  $invoiceIds
     */
    private function seedPayments(array $invoiceIds): void
    {
        if ($invoiceIds === []) {
            $this->command?->warn('No invoices; skipping payments.');

            return;
        }

        $count = min($this->clampCount((int) env('SEED_PAYMENT_COUNT', 6000)), count($invoiceIds));
        $maxI = count($invoiceIds) - 1;

        $methods = ['card', 'ecocash', 'bank_transfer', 'omari', 'zimswitch'];
        $statuses = [
            PaymentStatus::Pending->value,
            PaymentStatus::Processing->value,
            PaymentStatus::Succeeded->value,
            PaymentStatus::Failed->value,
            PaymentStatus::Refunded->value,
        ];

        $now = now();
        $batch = [];
        $bar = $this->command?->getOutput()->createProgressBar($count);
        $bar?->start();

        for ($i = 0; $i < $count; $i++) {
            $invoiceId = $invoiceIds[$i % count($invoiceIds)];
            $inv = DB::table('invoices')->where('id', $invoiceId)->first();
            if ($inv === null) {
                continue;
            }
            $amount = (string) $inv->amount;
            $status = $statuses[$i % count($statuses)];

            $batch[] = [
                'team_id' => $this->teamId,
                'invoice_id' => $invoiceId,
                'amount' => $amount,
                'currency' => 'USD',
                'original_amount' => null,
                'exchange_rate' => null,
                'payment_method' => $methods[$i % count($methods)],
                'status' => $status,
                'transaction_reference' => $status === PaymentStatus::Succeeded->value ? 'seed-ref-'.$invoiceId.'-'.$i : null,
                'created_at' => $now,
                'updated_at' => $now,
            ];
            $this->flushBatch('payments', $batch, $bar);
        }
        $this->flushBatch('payments', $batch, $bar, true);
        $bar?->finish();
        $this->command?->newLine();
        $this->info("Inserted {$count} payments.");
    }

    /**
     * @param  list<int>  $invoiceIds
     */
    private function seedEcocashTransactions(array $invoiceIds): void
    {
        if ($invoiceIds === []) {
            $this->command?->warn('No invoices; skipping EcoCash transactions.');

            return;
        }

        $count = min($this->clampCount((int) env('SEED_ECOCASH_COUNT', 2000)), count($invoiceIds));

        $statuses = [
            EcocashTransactionStatus::Pending->value,
            EcocashTransactionStatus::Completed->value,
            EcocashTransactionStatus::Failed->value,
            EcocashTransactionStatus::Cancelled->value,
        ];

        $now = now();
        $batch = [];
        $bar = $this->command?->getOutput()->createProgressBar($count);
        $bar?->start();

        for ($i = 0; $i < $count; $i++) {
            $invoiceId = $invoiceIds[$i % count($invoiceIds)];
            $status = $statuses[$i % count($statuses)];
            $completed = $status === EcocashTransactionStatus::Completed->value ? $now : null;

            $batch[] = [
                'team_id' => $this->teamId,
                'invoice_id' => $invoiceId,
                'client_correlator' => 'seed-cc-'.$this->teamId.'-'.$i.'-'.Str::lower(Str::random(12)),
                'reference_code' => 'seed-rc-'.$this->teamId.'-'.$i.'-'.Str::lower(Str::random(12)),
                'phone_number' => '0777'.str_pad((string) (100000 + $i), 6, '0', STR_PAD_LEFT),
                'local_amount' => number_format(1000 + $i % 50000, 2, '.', ''),
                'local_currency' => 'ZWG',
                'status' => $status,
                'ecocash_response' => json_encode(['seed' => true, 'i' => $i], JSON_THROW_ON_ERROR),
                'payment_id' => null,
                'completed_at' => $completed,
                'created_at' => $now,
                'updated_at' => $now,
            ];
            $this->flushBatch('ecocash_transactions', $batch, $bar);
        }
        $this->flushBatch('ecocash_transactions', $batch, $bar, true);
        $bar?->finish();
        $this->command?->newLine();
        $this->info("Inserted {$count} EcoCash transactions.");
    }

    /**
     * @param  array<int, array<string, mixed>>  $batch
     */
    private function flushBatch(string $table, array &$batch, ?ProgressBar $bar, bool $force = false): void
    {
        if ($batch === []) {
            return;
        }
        if (! $force && count($batch) < self::CHUNK) {
            return;
        }
        DB::table($table)->insert($batch);
        $bar?->advance(count($batch));
        $batch = [];
    }

    private function clampCount(int $count): int
    {
        return max(0, min(1_000_000, $count));
    }
}
