<?php

declare(strict_types=1);

namespace App\Data\Api;

use App\Data\Concerns\FromValidatedRequest;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class UpdateCustomerData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        public readonly ?string $name = null,
        public readonly ?string $email = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'nullable', 'string', 'email', 'max:255'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toPayload(): array
    {
        return array_filter($this->toArray(), fn (mixed $v): bool => $v !== null);
    }
}
