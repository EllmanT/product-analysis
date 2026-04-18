<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('invoices') || ! Schema::hasColumn('invoices', 'device_id')) {
            return;
        }

        DB::statement('ALTER TABLE invoices ALTER COLUMN device_id DROP NOT NULL');
    }

    public function down(): void
    {
        if (! Schema::hasTable('invoices') || ! Schema::hasColumn('invoices', 'device_id')) {
            return;
        }

        DB::statement('ALTER TABLE invoices ALTER COLUMN device_id SET NOT NULL');
    }
};

