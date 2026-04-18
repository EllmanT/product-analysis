<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('hs_codes')) {
            return;
        }

        Schema::create('hs_codes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code', 32)->unique();
            $table->text('description');
            $table->string('category', 255)->nullable();
            $table->boolean('is_service')->default(false);
            $table->string('default_tax_code', 8)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hs_codes');
    }
};
