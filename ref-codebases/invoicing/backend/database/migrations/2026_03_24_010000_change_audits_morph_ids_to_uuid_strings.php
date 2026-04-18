<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Default OwenIt audits migration uses bigint morph IDs; auditable models use UUID primary keys.
     */
    public function up(): void
    {
        $connection = config('audit.drivers.database.connection', config('database.default'));
        $tableName = config('audit.drivers.database.table', 'audits');

        if (! Schema::connection($connection)->hasTable($tableName)) {
            return;
        }

        Schema::connection($connection)->table($tableName, function (Blueprint $table) {
            $table->dropMorphs('auditable');
        });

        Schema::connection($connection)->table($tableName, function (Blueprint $table) {
            $table->dropIndex(['user_id', 'user_type']);
        });

        Schema::connection($connection)->table($tableName, function (Blueprint $table) {
            $table->dropColumn(['user_id', 'user_type']);
        });

        Schema::connection($connection)->table($tableName, function (Blueprint $table) {
            $table->string('user_type')->nullable();
            $table->string('user_id', 36)->nullable();
            $table->string('auditable_type');
            $table->string('auditable_id', 36);
            $table->index(['user_id', 'user_type']);
            $table->index(['auditable_type', 'auditable_id']);
        });
    }

    public function down(): void
    {
        $connection = config('audit.drivers.database.connection', config('database.default'));
        $tableName = config('audit.drivers.database.table', 'audits');

        if (! Schema::connection($connection)->hasTable($tableName)) {
            return;
        }

        Schema::connection($connection)->table($tableName, function (Blueprint $table) {
            $table->dropIndex(['auditable_type', 'auditable_id']);
            $table->dropIndex(['user_id', 'user_type']);
            $table->dropColumn(['auditable_type', 'auditable_id', 'user_type', 'user_id']);
        });

        $morphPrefix = config('audit.user.morph_prefix', 'user');

        Schema::connection($connection)->table($tableName, function (Blueprint $table) use ($morphPrefix) {
            $table->string($morphPrefix.'_type')->nullable();
            $table->unsignedBigInteger($morphPrefix.'_id')->nullable();
            $table->morphs('auditable');
            $table->index([$morphPrefix.'_id', $morphPrefix.'_type']);
        });
    }
};
