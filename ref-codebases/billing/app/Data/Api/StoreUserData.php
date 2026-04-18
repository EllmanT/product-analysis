<?php

declare(strict_types=1);

namespace App\Data\Api;

use App\Data\Concerns\FromValidatedRequest;
use Illuminate\Validation\Rules\Password;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class StoreUserData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        public readonly string $name,
        public readonly string $email,
        public readonly string $password,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'lowercase', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', Password::defaults()],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toPayload(int $teamId): array
    {
        return [
            'name' => $this->name,
            'email' => $this->email,
            'password' => $this->password,
            'team_id' => $teamId,
        ];
    }
}
