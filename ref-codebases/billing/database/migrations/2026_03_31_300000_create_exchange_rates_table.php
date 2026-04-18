<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exchange_rates', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            $table->string('currency', 10);          // non-USD currency code, e.g. ZWG
            $table->decimal('rate', 18, 6);           // units of currency per 1 USD (e.g. 13.5)
            $table->date('effective_date');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['team_id', 'currency', 'effective_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exchange_rates');
    }
};
