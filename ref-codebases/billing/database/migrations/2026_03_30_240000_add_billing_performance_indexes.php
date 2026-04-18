<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->index(['team_id', 'status'], 'subscriptions_team_id_status_index');
            $table->index(['team_id', 'end_date'], 'subscriptions_team_id_end_date_index');
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->index(['team_id', 'status'], 'invoices_team_id_status_index');
            $table->index(['team_id', 'due_date'], 'invoices_team_id_due_date_index');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->index(['team_id', 'status'], 'payments_team_id_status_index');
        });

        Schema::table('invoice_items', function (Blueprint $table) {
            $table->index(['team_id', 'invoice_id'], 'invoice_items_team_id_invoice_id_index');
        });
    }

    public function down(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropIndex('subscriptions_team_id_status_index');
            $table->dropIndex('subscriptions_team_id_end_date_index');
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->dropIndex('invoices_team_id_status_index');
            $table->dropIndex('invoices_team_id_due_date_index');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex('payments_team_id_status_index');
        });

        Schema::table('invoice_items', function (Blueprint $table) {
            $table->dropIndex('invoice_items_team_id_invoice_id_index');
        });
    }
};
