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
        Schema::create('invoices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->index();
            $table->uuid('device_id')->index();
            $table->uuid('buyer_id')->nullable();
            $table->string('created_by_user_id', 100);
            $table->string('invoice_no', 100)->unique()->index();
            $table->enum('receipt_type', ['FiscalInvoice','CreditNote','DebitNote']);
            $table->enum('receipt_print_form', ['InvoiceA4','Receipt48']);
            $table->string('receipt_currency', 10)->default('ZWG');
            $table->timestamp('receipt_date');
            $table->boolean('tax_inclusive')->default(true);
            $table->decimal('receipt_total',18,2);
            $table->decimal('total_excl_tax',18,2)->nullable();
            $table->decimal('total_vat',18,2)->default(0);
            $table->text('receipt_notes')->nullable();
            $table->string('customer_reference',255)->nullable();
            $table->enum('payment_method', ['CASH','CARD','TRANSFER','CHEQUE','OTHER']);
            $table->decimal('payment_amount',18,2);
            $table->uuid('ref_invoice_id')->nullable();
            $table->string('ref_invoice_no',100)->nullable();
            $table->timestamp('ref_invoice_date')->nullable();
            $table->string('ref_customer_reference',255)->nullable();
            $table->string('ref_device_serial',100)->nullable();
            $table->enum('status', ['DRAFT','SUBMITTED','QUEUED','FAILED','CANCELLED'])->default('DRAFT');
            $table->timestamp('fiscal_submission_at')->nullable();
            $table->json('buyer_snapshot')->nullable();
            $table->json('banking_details_snapshot')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};
