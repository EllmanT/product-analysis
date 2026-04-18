<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->json('fiscal_cloud_payload')->nullable()->after('email');
        });

        Schema::table('company_devices', function (Blueprint $table) {
            $table->json('fiscal_cloud_payload')->nullable()->after('auto_open_close_day');
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn('fiscal_cloud_payload');
        });

        Schema::table('company_devices', function (Blueprint $table) {
            $table->dropColumn('fiscal_cloud_payload');
        });
    }
};

