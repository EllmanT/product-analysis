<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('company_devices', function (Blueprint $table) {
            if (! Schema::hasColumn('company_devices', 'activation_status')) {
                $table->string('activation_status', 20)->default('PENDING')->after('fiscal_cloud_payload');
            }
            if (! Schema::hasColumn('company_devices', 'activation_attempted_at')) {
                $table->timestamp('activation_attempted_at')->nullable()->after('activation_status');
            }
            if (! Schema::hasColumn('company_devices', 'activation_error')) {
                $table->text('activation_error')->nullable()->after('activation_attempted_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('company_devices', function (Blueprint $table) {
            $drops = [];
            foreach (['activation_status', 'activation_attempted_at', 'activation_error'] as $col) {
                if (Schema::hasColumn('company_devices', $col)) {
                    $drops[] = $col;
                }
            }
            if ($drops !== []) {
                $table->dropColumn($drops);
            }
        });
    }
};

