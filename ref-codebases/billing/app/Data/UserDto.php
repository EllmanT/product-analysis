<?php

declare(strict_types=1);

namespace App\Data;

use App\Models\User;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class UserDto extends Data
{
    public function __construct(
        public readonly int $id,
        public readonly ?int $team_id,
        public readonly string $name,
        public readonly string $email,
    ) {}

    public static function fromUser(User $user): self
    {
        return new self(
            id: $user->id,
            team_id: $user->team_id,
            name: $user->name,
            email: $user->email,
        );
    }
}
