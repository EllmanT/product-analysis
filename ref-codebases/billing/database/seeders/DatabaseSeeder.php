<?php

namespace Database\Seeders;

use App\Models\Team;
use App\Models\User;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $team = Team::create([
            'name' => 'Axis Solutions',
        ]);

        User::factory()->create([
            'name' => 'Mqondisi Ndlovu',
            'email' => 'mndlovu@axissol.com',
            'password' => bcrypt('Password123#'),
            'team_id' => $team->id,
        ]);
    }
}
