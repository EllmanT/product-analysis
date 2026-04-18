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
        Schema::create('invoice_lines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('invoice_id')->index();
            $table->integer('line_no');
            $table->enum('line_type', ['Sale','Discount']);
            $table->string('hs_code',20)->nullable();
            $table->string('description',500);
            $table->decimal('quantity',18,4);
            $table->decimal('unit_price',18,4);
            $table->enum('tax_code', ['A','B','C']);
            $table->decimal('tax_percent',5,2);
            $table->decimal('vat_amount',18,2)->default(0);
            $table->decimal('line_total_excl',18,2)->nullable();
            $table->decimal('line_total_incl',18,2);
            $table->uuid('product_id')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('invoice_lines');
    }
};
