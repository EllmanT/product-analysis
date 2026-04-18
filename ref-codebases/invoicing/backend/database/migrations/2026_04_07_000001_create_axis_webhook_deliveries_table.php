<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('axis_webhook_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->string('payload_hash', 64)->unique();
            $table->longText('payload');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('axis_webhook_deliveries');
    }
};

