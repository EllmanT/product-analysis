<?php

declare(strict_types=1);

namespace App\Data;

use App\Data\Concerns\FromValidatedRequest;
use App\Enums\SubscriptionStatus;
use Illuminate\Validation\Rule;
use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
final class TransitionSubscriptionStatusInputData extends Data
{
    use FromValidatedRequest;

    public function __construct(
        public readonly SubscriptionStatus $status,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'status' => ['required', Rule::enum(SubscriptionStatus::class)],
        ];
    }
}
