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
        Schema::create('buyers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->index();
            $table->string('register_name', 255);
            $table->string('trade_name', 255)->nullable();
            $table->string('tin', 50)->nullable()->index();
            $table->string('vat_number', 50)->nullable();
            $table->string('address_province', 100)->nullable();
            $table->string('address_city', 100)->nullable();
            $table->string('address_street', 255)->nullable();
            $table->string('address_house_no', 50)->nullable();
            $table->string('email', 255)->nullable();
            $table->string('phone', 50)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('buyers');
    }
};
