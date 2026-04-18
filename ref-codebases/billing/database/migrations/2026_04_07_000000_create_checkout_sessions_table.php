<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('checkout_sessions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            $table->foreignId('plan_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();

            // Public, unguessable identifier used in hosted checkout URLs
            $table->uuid('public_id')->unique();

            // Where to redirect the user after payment completion/cancel
            $table->text('callback_url');

            // External system reference (optional)
            $table->string('external_reference')->nullable();

            // selected payment platform (e.g. zimswitch/ecocash/omari)
            $table->string('payment_platform')->nullable();

            // provider-specific references (e.g. OPPWA checkout id, EcoCash reference code)
            $table->string('provider_checkout_id')->nullable();
            $table->string('provider_reference')->nullable();

            // lifecycle
            $table->string('status')->default('open'); // open|processing|succeeded|failed|expired|canceled
            $table->timestamp('completed_at')->nullable();

            // Result links (filled on success)
            $table->foreignId('subscription_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('payment_id')->nullable()->constrained()->nullOnDelete();

            $table->json('metadata')->nullable();

            $table->timestamps();

            $table->index(['team_id', 'status']);
            $table->index(['team_id', 'plan_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('checkout_sessions');
    }
};
