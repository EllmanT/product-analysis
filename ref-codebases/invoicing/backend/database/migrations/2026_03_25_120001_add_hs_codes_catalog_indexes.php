<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Supports tenant listing and filtering: active catalog rows ordered by code.
     * Unique index on code already exists from table creation.
     */
    public function up(): void
    {
        Schema::table('hs_codes', function (Blueprint $table) {
            $table->index(['is_active', 'code'], 'hs_codes_is_active_code_idx');
        });
    }

    public function down(): void
    {
        Schema::table('hs_codes', function (Blueprint $table) {
            $table->dropIndex('hs_codes_is_active_code_idx');
        });
    }
};
