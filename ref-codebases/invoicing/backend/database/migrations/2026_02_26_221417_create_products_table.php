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
        Schema::create('products', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->index();
            $table->string('name', 255);
            $table->text('description')->nullable();
            $table->string('hs_code', 20)->nullable();
            $table->decimal('default_unit_price', 18,4)->nullable();
            $table->enum('tax_code', ['A','B','C']);
            $table->decimal('tax_percent',5,2)->default(15.0);
            $table->string('unit_of_measure',50)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
