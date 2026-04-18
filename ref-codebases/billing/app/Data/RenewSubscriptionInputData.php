<?php

declare(strict_types=1);

namespace App\Data;

use App\Data\Concerns\FromValidatedRequest;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class RenewSubscriptionInputData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        /** Overrides the computed next period end. */
        public readonly ?string $new_end_date = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'new_end_date' => ['nullable', 'date'],
        ];
    }
}
