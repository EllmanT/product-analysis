<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('company_devices', function (Blueprint $table) {
            $table->string('zimra_device_id', 120)->nullable()->index()->after('device_name');
            $table->string('zimra_activation_key', 255)->nullable()->after('zimra_device_id');
            $table->string('zimra_environment', 20)->nullable()->after('zimra_activation_key');
            $table->json('zimra_payload')->nullable()->after('zimra_environment');
            $table->timestamp('fiscal_cloud_activated_at')->nullable()->after('zimra_payload');
            $table->json('fiscal_cloud_activation_payload')->nullable()->after('fiscal_cloud_activated_at');
        });
    }

    public function down(): void
    {
        Schema::table('company_devices', function (Blueprint $table) {
            $table->dropColumn([
                'zimra_device_id',
                'zimra_activation_key',
                'zimra_environment',
                'zimra_payload',
                'fiscal_cloud_activated_at',
                'fiscal_cloud_activation_payload',
            ]);
        });
    }
};

