<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table): void {
            // Currency the payment was made in (defaults to USD)
            $table->string('currency', 10)->default('USD')->after('amount');
            // Original amount in the non-USD currency (null when paid in USD)
            $table->decimal('original_amount', 18, 6)->nullable()->after('currency');
            // Snapshot of the exchange rate used at payment time
            $table->decimal('exchange_rate', 18, 6)->nullable()->after('original_amount');
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table): void {
            $table->dropColumn(['currency', 'original_amount', 'exchange_rate']);
        });
    }
};
