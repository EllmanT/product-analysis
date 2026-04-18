<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('oauth_provider', 50)->nullable()->after('password');
            $table->string('oauth_provider_id', 255)->nullable()->after('oauth_provider');
            $table->unique(['oauth_provider', 'oauth_provider_id'], 'users_oauth_provider_unique');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('users_oauth_provider_unique');
            $table->dropColumn(['oauth_provider', 'oauth_provider_id']);
        });
    }
};

