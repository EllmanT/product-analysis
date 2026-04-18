<?php

declare(strict_types=1);

namespace App\Data;

use App\Data\Concerns\FromValidatedRequest;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class CancelSubscriptionInputData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        /** When access ends; defaults to today if omitted. */
        public readonly ?string $end_date = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'end_date' => ['nullable', 'date'],
        ];
    }
}
