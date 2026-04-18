<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table): void {
            // JSON array of accepted PaymentPlatform values.
            // Defaults to all four platforms so existing plans are unaffected.
            $table->json('payment_platforms')
                ->default(json_encode(['ecocash', 'omari', 'zimswitch']))
                ->after('currency');
        });

        Schema::table('subscriptions', function (Blueprint $table): void {
            // The platform used to pay/set up this subscription (nullable = unknown / not yet paid).
            $table->string('payment_platform', 30)->nullable()->after('trial_end');
        });
    }

    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table): void {
            $table->dropColumn('payment_platforms');
        });

        Schema::table('subscriptions', function (Blueprint $table): void {
            $table->dropColumn('payment_platform');
        });
    }
};
