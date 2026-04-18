<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('companies') && Schema::hasColumn('companies', 'auth0_user_id')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->dropColumn('auth0_user_id');
            });
        }

        if (Schema::hasTable('non_fiscalized_companies') && Schema::hasColumn('non_fiscalized_companies', 'auth0_user_id')) {
            Schema::table('non_fiscalized_companies', function (Blueprint $table): void {
                $table->dropColumn('auth0_user_id');
            });
        }

        if (Schema::hasTable('users') && ! Schema::hasColumn('users', 'fiscal_cloud_user_id')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->unsignedBigInteger('fiscal_cloud_user_id')->nullable()->after('company_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('users') && Schema::hasColumn('users', 'fiscal_cloud_user_id')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->dropColumn('fiscal_cloud_user_id');
            });
        }

        if (Schema::hasTable('companies') && ! Schema::hasColumn('companies', 'auth0_user_id')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->string('auth0_user_id', 100)->nullable();
            });
        }

        if (Schema::hasTable('non_fiscalized_companies') && ! Schema::hasColumn('non_fiscalized_companies', 'auth0_user_id')) {
            Schema::table('non_fiscalized_companies', function (Blueprint $table): void {
                $table->string('auth0_user_id', 100)->nullable();
            });
        }
    }
};
