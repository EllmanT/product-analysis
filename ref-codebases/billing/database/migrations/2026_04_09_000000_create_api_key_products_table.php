<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('api_key_products', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('api_key_id')->constrained('api_keys')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['api_key_id', 'product_id']);
            $table->index(['product_id', 'api_key_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('api_key_products');
    }
};
