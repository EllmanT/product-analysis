<?php

declare(strict_types=1);

namespace App\Services;

use App\Data\Api\StoreUserData;
use App\Data\Api\UpdateUserData;
use App\Data\UserDto;
use App\Models\User;
use Illuminate\Support\Collection;
use RuntimeException;

final class UserService
{
    /**
     * @return Collection<int, UserDto>
     */
    public function listUsers(): Collection
    {
        return User::query()
            ->orderBy('name')
            ->get()
            ->map(fn (User $user): UserDto => UserDto::fromUser($user));
    }

    public function getUser(User $user): UserDto
    {
        return UserDto::fromUser($user);
    }

    public function createUser(StoreUserData $data): UserDto
    {
        $teamId = auth()->user()?->team_id;
        if ($teamId === null || $teamId === '') {
            throw new RuntimeException('No team context.');
        }

        $user = User::query()->create($data->toPayload((int) $teamId));

        return UserDto::fromUser($user->refresh());
    }

    public function updateUser(User $user, UpdateUserData $data): UserDto
    {
        $payload = $data->toPayload();
        if ($payload !== []) {
            $user->update($payload);
        }

        return UserDto::fromUser($user->refresh());
    }

    public function deleteUser(User $user): void
    {
        if ($user->id === auth()->id()) {
            throw new RuntimeException('You cannot delete your own account.');
        }

        $user->delete();
    }
}
