<?php

namespace App\Data;

use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
class UserData extends Data
{
    public function __construct(
        public string $firstName,
        public string $lastName,
        public string $email,
        public ?string $phone = null,
        public string $password, // hashed
        public string $role = 'USER',
        public bool $isActive = true,
        public ?string $companyId = null,
    ) {}

    /** @return array<string, array<int, string>> */
    public static function validationRules(): array
    {
        return [
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'password' => ['required', 'string', 'min:8'],
            'role' => ['string', 'in:SUPER_ADMIN,ADMIN,USER'],
            'is_active' => ['boolean'],
        ];
    }

    /** @return array<string, array<int, string>> */
    public static function validationRulesForUpdate(): array
    {
        $rules = self::validationRules();
        $out = array_map(fn (array $r) => ['sometimes', ...array_diff($r, ['required'])], $rules);
        $out['password'] = ['sometimes', 'nullable', 'string', 'min:8'];
        return $out;
    }
}
