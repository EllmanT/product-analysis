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
        Schema::create('companies', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('fiscal_cloud_company_id', 100)->unique();
            $table->string('legal_name', 255);
            $table->string('trade_name', 255)->nullable();
            $table->string('tin', 50)->index();
            $table->string('vat_number', 50)->nullable()->index();
            $table->text('address')->nullable();
            $table->string('phone', 50)->nullable();
            $table->string('email', 255)->nullable();
            $table->string('logo_url', 500)->nullable();
            $table->boolean('is_service_company')->default(false);
            $table->boolean('default_tax_inclusive')->default(true);
            $table->string('default_currency', 10)->default('ZWG');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('companies');
    }
};
