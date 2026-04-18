<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('billing_interval_configs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            $table->string('label');
            $table->string('value');
            $table->boolean('is_recurring')->default(false);
            $table->unsignedTinyInteger('interval_count')->nullable();
            $table->string('interval_unit', 10)->nullable(); // day, week, month, year
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['team_id', 'value']);
        });

        // Seed the three built-in intervals for every existing team.
        $defaults = [
            ['label' => 'One-time',             'value' => 'one_time', 'is_recurring' => false, 'interval_count' => null, 'interval_unit' => null, 'sort_order' => 0],
            ['label' => 'Monthly (recurring)',  'value' => 'monthly',  'is_recurring' => true,  'interval_count' => 1,    'interval_unit' => 'month', 'sort_order' => 1],
            ['label' => 'Yearly (recurring)',   'value' => 'yearly',   'is_recurring' => true,  'interval_count' => 12,   'interval_unit' => 'month', 'sort_order' => 2],
        ];

        $now = now();

        DB::table('teams')->pluck('id')->each(function (int $teamId) use ($defaults, $now): void {
            foreach ($defaults as $row) {
                DB::table('billing_interval_configs')->insertOrIgnore([
                    ...$row,
                    'team_id' => $teamId,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('billing_interval_configs');
    }
};
