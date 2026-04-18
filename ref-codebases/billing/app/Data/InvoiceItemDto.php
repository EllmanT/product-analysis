<?php

declare(strict_types=1);

namespace App\Data;

use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class InvoiceItemDto extends Data
{
    public function __construct(
        public readonly ?int $id,
        public readonly ?int $team_id,
        public readonly int $invoice_id,
        public readonly string $description,
        public readonly int $quantity,
        public readonly string $unit_price,
        public readonly string $total,
        public readonly ?InvoiceDto $invoice = null,
    ) {}
}
