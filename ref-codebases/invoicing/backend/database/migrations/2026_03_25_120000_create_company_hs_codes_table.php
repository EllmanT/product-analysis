<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-tenant HS code enablement. Missing row means the tenant inherits the global
     * hs_codes.is_active flag (enabled when the catalog row is active).
     *
     * Indexed for lookups by tenant (list/filter enabled codes) and by HS code
     * (which companies use or block a code). Table partitioning is not used here so
     * SQLite and portable migrations stay simple; at very large scale, consider
     * LIST/HASH partitioning on company_id for MySQL/PostgreSQL only.
     */
    public function up(): void
    {
        Schema::create('company_hs_codes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id');
            $table->uuid('hs_code_id');
            $table->boolean('is_enabled')->default(true);
            $table->timestamps();

            $table->unique(['company_id', 'hs_code_id']);
            $table->index(['company_id', 'is_enabled'], 'company_hs_codes_company_enabled_idx');
            $table->index(['hs_code_id', 'company_id'], 'company_hs_codes_hs_company_idx');

            $table->foreign('company_id')
                ->references('id')
                ->on('companies')
                ->cascadeOnDelete();

            $table->foreign('hs_code_id')
                ->references('id')
                ->on('hs_codes')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('company_hs_codes');
    }
};
