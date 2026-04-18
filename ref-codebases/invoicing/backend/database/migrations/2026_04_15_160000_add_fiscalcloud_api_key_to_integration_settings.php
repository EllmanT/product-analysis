<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $exists = DB::table('settings')
            ->where('group', 'integration')
            ->where('name', 'fiscalcloud_api_key')
            ->exists();

        if ($exists) {
            return;
        }

        DB::table('settings')->insert([
            'group' => 'integration',
            'name' => 'fiscalcloud_api_key',
            'locked' => false,
            'payload' => json_encode(''),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('settings')
            ->where('group', 'integration')
            ->where('name', 'fiscalcloud_api_key')
            ->delete();
    }
};

