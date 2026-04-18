<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('company_devices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->index();
            $table->string('fiscal_device_id', 50)->unique()->index();
            $table->string('device_serial_no', 100)->nullable();
            $table->string('device_name', 100)->nullable();
            $table->enum('fiscal_day_status', ['OPEN','CLOSED','UNKNOWN'])->default('UNKNOWN');
            $table->timestamp('fiscal_day_open_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('auto_open_close_day')->default(false);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('company_devices');
    }
};
