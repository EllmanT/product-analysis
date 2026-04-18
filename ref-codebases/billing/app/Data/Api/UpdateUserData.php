<?php

declare(strict_types=1);

namespace App\Data\Api;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class UpdateUserData extends Data
{
    public function __construct(
        public readonly ?string $name = null,
        public readonly ?string $email = null,
        public readonly ?string $password = null,
    ) {}

    public static function fromRequest(Request $request, User $user): static
    {
        $validated = Validator::make($request->all(), [
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => [
                'sometimes',
                'string',
                'lowercase',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($user->id),
            ],
            'password' => ['sometimes', 'nullable', 'string', Password::defaults()],
        ])->validate();

        return self::from($validated);
    }

    /**
     * @return array<string, mixed>
     */
    public function toPayload(): array
    {
        $payload = [];
        if ($this->name !== null) {
            $payload['name'] = $this->name;
        }
        if ($this->email !== null) {
            $payload['email'] = $this->email;
        }
        if ($this->password !== null && $this->password !== '') {
            $payload['password'] = $this->password;
        }

        return $payload;
    }
}
