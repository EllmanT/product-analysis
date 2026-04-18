<?php

namespace App\Data;

use Spatie\LaravelData\Attributes\MapName;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Mappers\SnakeCaseMapper;

#[MapName(SnakeCaseMapper::class)]
class CompanyDeviceData extends Data
{
    public function __construct(
        public string $fiscalDeviceId,
        public ?string $deviceSerialNo = null,
        public ?string $deviceName = null,
        public string $fiscalDayStatus = 'UNKNOWN',
        public ?\DateTime $fiscalDayOpenAt = null,
        public bool $isActive = true,
        public bool $autoOpenCloseDay = false,
    ) {}

    /** @return array<string, array<int, string>> */
    public static function validationRules(): array
    {
        return [
            'fiscal_device_id' => ['required', 'string', 'max:50'],
            'device_serial_no' => ['nullable', 'string', 'max:100'],
            'device_name' => ['nullable', 'string', 'max:100'],
            'fiscal_day_status' => ['string', 'in:OPEN,CLOSED,UNKNOWN'],
            'fiscal_day_open_at' => ['nullable', 'date'],
            'is_active' => ['boolean'],
            'auto_open_close_day' => ['boolean'],
        ];
    }

    /** @return array<string, array<int, string>> */
    public static function validationRulesForUpdate(): array
    {
        return array_map(fn (array $rules) => ['sometimes', ...array_diff($rules, ['required'])], self::validationRules());
    }
}
