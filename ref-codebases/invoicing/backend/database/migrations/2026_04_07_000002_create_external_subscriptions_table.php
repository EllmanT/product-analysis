<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('external_subscriptions', function (Blueprint $table): void {
            $table->id();
            $table->string('axis_subscription_id')->unique();
            $table->integer('team_id')->nullable();
            $table->integer('customer_id')->nullable();
            $table->integer('plan_id')->nullable();
            $table->string('status');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('external_subscriptions');
    }
};

