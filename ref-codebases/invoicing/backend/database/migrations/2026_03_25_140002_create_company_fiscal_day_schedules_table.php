<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('company_fiscal_day_schedules', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->unique();
            $table->boolean('is_enabled')->default(false);
            $table->boolean('auto_close_enabled')->default(false);
            $table->boolean('auto_open_enabled')->default(false);
            $table->time('close_time')->nullable();
            $table->time('open_time')->nullable();
            $table->json('close_weekdays')->nullable();
            $table->json('open_weekdays')->nullable();
            $table->string('timezone', 64)->nullable();
            $table->date('last_auto_close_date')->nullable();
            $table->date('last_auto_open_date')->nullable();
            $table->timestamps();

            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('company_fiscal_day_schedules');
    }
};
