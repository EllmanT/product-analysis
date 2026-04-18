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
        Schema::create('hs_codes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code', 20)->unique()->index();
            $table->text('description');
            $table->string('category',255)->nullable();
            $table->boolean('is_service')->default(false);
            $table->enum('default_tax_code', ['A','B','C'])->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hs_codes');
    }
};
