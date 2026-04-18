<?php

namespace App\Jobs;

use App\Models\CompanyFiscalDaySchedule;
use App\Services\ZimraFiscalService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class RunScheduledFiscalDayOpenJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 120;

    public function __construct(
        public string $scheduleId,
        public string $forDate
    ) {}

    public function handle(ZimraFiscalService $fiscal): void
    {
        $schedule = CompanyFiscalDaySchedule::query()->with('company')->find($this->scheduleId);
        if ($schedule === null) {
            return;
        }

        $company = $schedule->company;
        if (
            $company === null
            || ! $company->is_active
            || ! $schedule->is_enabled
            || ! $schedule->auto_open_enabled
        ) {
            return;
        }

        $last = $schedule->last_auto_open_date?->format('Y-m-d');
        if ($last === $this->forDate) {
            return;
        }

        Log::info('Fiscal schedule job: auto open', [
            'company_id' => $company->id,
            'schedule_id' => $schedule->id,
            'for_date' => $this->forDate,
        ]);

        $result = $fiscal->openFiscalDay();
        if ($result['success'] ?? false) {
            $schedule->last_auto_open_date = $this->forDate;
            $schedule->save();

            return;
        }

        $message = (string) ($result['message'] ?? 'Unknown open fiscal day failure.');
        Log::warning('Fiscal schedule job: auto open failed', [
            'company_id' => $company->id,
            'schedule_id' => $schedule->id,
            'message' => $message,
        ]);

        throw new \RuntimeException($message);
    }
}
