<?php

declare(strict_types=1);

use App\Models\Team;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        User::query()->whereNull('team_id')->each(function (User $user): void {
            $team = Team::create([
                'name' => $user->name.'\'s team',
            ]);
            $user->update(['team_id' => $team->id]);
        });
    }

    public function down(): void
    {
        //
    }
};
