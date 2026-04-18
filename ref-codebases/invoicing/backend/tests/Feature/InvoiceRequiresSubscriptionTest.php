<?php

declare(strict_types=1);

use App\Models\Company;
use App\Models\ExternalSubscription;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    Schema::dropIfExists('invoices');
    Schema::dropIfExists('invoice_lines');
    Schema::dropIfExists('invoice_taxes');
    Schema::dropIfExists('users');
    Schema::dropIfExists('companies');
    Schema::dropIfExists('external_subscriptions');

    Schema::create('companies', function (Blueprint $table): void {
        $table->uuid('id')->primary();
        $table->integer('axis_billing_customer_id')->nullable()->index();
        $table->boolean('is_active')->default(true);
        $table->timestamps();
    });

    Schema::create('users', function (Blueprint $table): void {
        $table->uuid('id')->primary();
        $table->uuid('company_id')->nullable()->index();
        $table->string('email')->unique();
        $table->string('password')->nullable();
        $table->timestamps();
    });

    Schema::create('external_subscriptions', function (Blueprint $table): void {
        $table->id();
        $table->string('axis_subscription_id')->unique();
        $table->integer('team_id')->nullable();
        $table->integer('customer_id')->nullable();
        $table->integer('plan_id')->nullable();
        $table->string('status');
        $table->timestamps();
    });

    Schema::create('invoices', function (Blueprint $table): void {
        $table->uuid('id')->primary();
        $table->uuid('company_id')->index();
        $table->uuid('created_by_user_id')->nullable();

        $table->string('invoice_no', 100);
        $table->string('receipt_type');
        $table->string('receipt_print_form');
        $table->string('receipt_currency', 10)->default('ZWG');
        $table->dateTime('receipt_date');
        $table->boolean('tax_inclusive')->default(true);
        $table->decimal('receipt_total', 18, 2);
        $table->decimal('total_excl_tax', 18, 2)->nullable();
        $table->decimal('total_vat', 18, 2)->default(0);
        $table->string('payment_method');
        $table->decimal('payment_amount', 18, 2);

        $table->timestamps();
    });

    Schema::create('invoice_lines', function (Blueprint $table): void {
        $table->id();
        $table->uuid('invoice_id')->index();
        $table->integer('line_no')->nullable();
        $table->string('description')->nullable();
        $table->timestamps();
    });

    Schema::create('invoice_taxes', function (Blueprint $table): void {
        $table->id();
        $table->uuid('invoice_id')->index();
        $table->string('tax_code')->nullable();
        $table->timestamps();
    });
});

it('blocks invoice creation without an active subscription', function (): void {
    $company = Company::query()->create([
        'axis_billing_customer_id' => 456,
        'is_active' => true,
    ]);

    $user = User::query()->create([
        'company_id' => $company->id,
        'email' => 'user@example.com',
        'password' => bcrypt('secret'),
    ]);

    Sanctum::actingAs($user);

    $payload = [
        'invoice_no' => 'INV-001',
        'receipt_type' => 'FiscalInvoice',
        'receipt_print_form' => 'InvoiceA4',
        'receipt_currency' => 'ZWG',
        'receipt_date' => '2026-04-07T12:00:00Z',
        'tax_inclusive' => true,
        'receipt_total' => 10,
        'total_excl_tax' => 10,
        'total_vat' => 0,
        'payment_method' => 'CASH',
        'payment_amount' => 10,
        'lines' => [],
        'taxes' => [],
    ];

    $this->postJson('/api/invoices', $payload)
        ->assertStatus(402)
        ->assertJson([
            'message' => 'Active subscription required to create invoices.',
        ]);
});

it('allows invoice creation with an active subscription', function (): void {
    $company = Company::query()->create([
        'axis_billing_customer_id' => 456,
        'is_active' => true,
    ]);

    $user = User::query()->create([
        'company_id' => $company->id,
        'email' => 'user2@example.com',
        'password' => bcrypt('secret'),
    ]);

    ExternalSubscription::query()->create([
        'axis_subscription_id' => 'sub_active',
        'team_id' => 999,
        'customer_id' => 456,
        'plan_id' => 1,
        'status' => 'active',
    ]);

    Sanctum::actingAs($user);

    $payload = [
        'invoice_no' => 'INV-002',
        'receipt_type' => 'FiscalInvoice',
        'receipt_print_form' => 'InvoiceA4',
        'receipt_currency' => 'ZWG',
        'receipt_date' => '2026-04-07T12:00:00Z',
        'tax_inclusive' => true,
        'receipt_total' => 10,
        'total_excl_tax' => 10,
        'total_vat' => 0,
        'payment_method' => 'CASH',
        'payment_amount' => 10,
        'lines' => [],
        'taxes' => [],
    ];

    $this->postJson('/api/invoices', $payload)
        ->assertStatus(201);
});

