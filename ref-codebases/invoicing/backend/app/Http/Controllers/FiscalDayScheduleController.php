<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesTenantCompany;
use App\Http\Requests\UpdateFiscalDayScheduleRequest;
use App\Models\CompanyFiscalDaySchedule;
use Illuminate\Http\JsonResponse;

class FiscalDayScheduleController extends Controller
{
    use ResolvesTenantCompany;

    public function show(): JsonResponse
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $schedule = CompanyFiscalDaySchedule::query()->firstOrNew(
            ['company_id' => $company->id],
            [
                'is_enabled' => false,
                'auto_close_enabled' => false,
                'auto_open_enabled' => false,
                'close_weekdays' => [],
                'open_weekdays' => [],
            ]
        );

        if (! $schedule->exists) {
            return response()->json([
                'id' => null,
                'company_id' => $company->id,
                'is_enabled' => false,
                'auto_close_enabled' => false,
                'auto_open_enabled' => false,
                'close_time' => null,
                'open_time' => null,
                'close_weekdays' => [],
                'open_weekdays' => [],
                'timezone' => null,
                'last_auto_close_date' => null,
                'last_auto_open_date' => null,
                'updated_at' => null,
            ]);
        }

        return response()->json($this->serializeSchedule($schedule));
    }

    public function update(UpdateFiscalDayScheduleRequest $request): JsonResponse
    {
        $company = $this->resolveCompany();
        if ($company === null) {
            return $this->tenantForbidden();
        }

        $data = $request->validated();

        if (array_key_exists('close_time', $data)) {
            $data['close_time'] = $data['close_time'] !== null ? $data['close_time'].':00' : null;
        }
        if (array_key_exists('open_time', $data)) {
            $data['open_time'] = $data['open_time'] !== null ? $data['open_time'].':00' : null;
        }

        $schedule = CompanyFiscalDaySchedule::query()->firstOrNew(
            ['company_id' => $company->id],
            [
                'is_enabled' => false,
                'auto_close_enabled' => false,
                'auto_open_enabled' => false,
                'close_weekdays' => [],
                'open_weekdays' => [],
            ]
        );

        $schedule->fill($data);
        $schedule->company_id = $company->id;
        $schedule->save();

        return response()->json($this->serializeSchedule($schedule->fresh()));
    }

    /** @return array<string, mixed> */
    private function serializeSchedule(CompanyFiscalDaySchedule $schedule): array
    {
        $close = $schedule->close_time;
        $open = $schedule->open_time;

        return [
            'id' => $schedule->id,
            'company_id' => $schedule->company_id,
            'is_enabled' => (bool) $schedule->is_enabled,
            'auto_close_enabled' => (bool) $schedule->auto_close_enabled,
            'auto_open_enabled' => (bool) $schedule->auto_open_enabled,
            'close_time' => $this->formatTimeHm($close),
            'open_time' => $this->formatTimeHm($open),
            'close_weekdays' => $schedule->close_weekdays ?? [],
            'open_weekdays' => $schedule->open_weekdays ?? [],
            'timezone' => $schedule->timezone,
            'last_auto_close_date' => $schedule->last_auto_close_date?->toDateString(),
            'last_auto_open_date' => $schedule->last_auto_open_date?->toDateString(),
            'updated_at' => $schedule->updated_at,
        ];
    }

    private function formatTimeHm(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $s = (string) $value;

        return strlen($s) >= 5 ? substr($s, 0, 5) : $s;
    }
}
