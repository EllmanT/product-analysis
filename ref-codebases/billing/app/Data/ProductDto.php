<?php

declare(strict_types=1);

namespace App\Data;

use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class ProductDto extends Data
{
    public function __construct(
        public readonly ?int $id,
        public readonly ?int $team_id,
        public readonly string $name,
        public readonly ?string $description,
    ) {}
}
