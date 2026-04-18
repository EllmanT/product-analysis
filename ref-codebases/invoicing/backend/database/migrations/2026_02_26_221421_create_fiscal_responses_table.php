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
        Schema::create('fiscal_responses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('invoice_id')->unique();
            $table->text('qr_code_url');
            $table->string('verification_code',50);
            $table->string('verification_link',500);
            $table->integer('fiscal_day_no');
            $table->integer('receipt_global_no');
            $table->integer('receipt_counter');
            $table->integer('receipt_id');
            $table->string('device_id',50);
            $table->string('fdms_invoice_no',100)->nullable();
            $table->string('api_response_code',10)->nullable();
            $table->string('api_response_message',255)->nullable();
            $table->json('raw_response')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fiscal_responses');
    }
};
