<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('external_invoices', function (Blueprint $table): void {
            $table->id();
            $table->string('axis_invoice_id')->unique();
            $table->string('axis_subscription_id')->nullable()->index();
            $table->integer('customer_id')->nullable()->index();
            $table->string('status')->nullable();
            $table->string('currency', 10)->nullable();
            $table->decimal('amount', 18, 2)->nullable();
            $table->dateTime('issued_at')->nullable();
            $table->longText('payload')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('external_invoices');
    }
};

