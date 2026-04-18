<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table): void {
            $table->foreignId('checkout_session_id')
                ->nullable()
                ->after('subscription_id')
                ->constrained('checkout_sessions')
                ->nullOnDelete();

            $table->index(['team_id', 'checkout_session_id']);
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table): void {
            $table->dropIndex(['team_id', 'checkout_session_id']);
            $table->dropConstrainedForeignId('checkout_session_id');
        });
    }
};
