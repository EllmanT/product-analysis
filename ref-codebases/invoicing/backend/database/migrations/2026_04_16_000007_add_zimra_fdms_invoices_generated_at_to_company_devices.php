<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('company_devices', function (Blueprint $table) {
            if (! Schema::hasColumn('company_devices', 'zimra_fdms_invoices_generated_at')) {
                $table->timestamp('zimra_fdms_invoices_generated_at')->nullable()->after('zimra_fdms_template_emailed_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('company_devices', function (Blueprint $table) {
            if (Schema::hasColumn('company_devices', 'zimra_fdms_invoices_generated_at')) {
                $table->dropColumn('zimra_fdms_invoices_generated_at');
            }
        });
    }
};
