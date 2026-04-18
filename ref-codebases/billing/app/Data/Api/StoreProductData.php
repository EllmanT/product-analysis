<?php

declare(strict_types=1);

namespace App\Data\Api;

use App\Data\Concerns\FromValidatedRequest;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class StoreProductData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        public readonly string $name,
        public readonly ?string $description = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
        ];
    }
}
