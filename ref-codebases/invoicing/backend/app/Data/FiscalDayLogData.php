<?php

namespace App\Data;

use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
class FiscalDayLogData extends Data
{
    public function __construct(
        public string $deviceId,
        public string $action, // OPEN or CLOSE
        public ?int $fiscalDayNo = null,
        public string $triggeredByUserId,
        public bool $isAutomated = false,
        public ?array $apiResponse = null, // raw response as array
    ) {}

    /** @return array<string, array<int, string>> */
    public static function validationRules(): array
    {
        return [
            'device_id' => ['required', 'uuid'],
            'action' => ['required', 'string', 'in:OPEN,CLOSE'],
            'fiscal_day_no' => ['nullable', 'integer'],
            'triggered_by_user_id' => ['required', 'string', 'max:100'],
            'is_automated' => ['boolean'],
            'api_response' => ['nullable', 'array'],
        ];
    }

    /** @return array<string, array<int, string>> */
    public static function validationRulesForUpdate(): array
    {
        return array_map(fn (array $rules) => ['sometimes', ...array_diff($rules, ['required'])], self::validationRules());
    }
}
