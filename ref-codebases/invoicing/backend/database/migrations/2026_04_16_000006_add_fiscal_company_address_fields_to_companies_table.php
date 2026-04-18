<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->string('region', 120)->nullable()->after('vat_number');
            $table->string('station', 120)->nullable()->after('region');
            $table->string('province', 120)->nullable()->after('station');
            $table->string('city', 120)->nullable()->after('province');
            $table->string('address_line', 255)->nullable()->after('city');
            $table->string('house_number', 50)->nullable()->after('address_line');
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn(['region', 'station', 'province', 'city', 'address_line', 'house_number']);
        });
    }
};

