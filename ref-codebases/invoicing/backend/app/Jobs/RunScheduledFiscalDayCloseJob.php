<?php

namespace App\Jobs;

use App\Models\CompanyFiscalDaySchedule;
use App\Services\ZimraFiscalService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class RunScheduledFiscalDayCloseJob implements ShouldQueue
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
            || ! $schedule->auto_close_enabled
        ) {
            return;
        }

        $last = $schedule->last_auto_close_date?->format('Y-m-d');
        if ($last === $this->forDate) {
            return;
        }

        Log::info('Fiscal schedule job: auto close', [
            'company_id' => $company->id,
            'schedule_id' => $schedule->id,
            'for_date' => $this->forDate,
        ]);

        $result = $fiscal->closeFiscalDay();
        if ($result['success'] ?? false) {
            $schedule->last_auto_close_date = $this->forDate;
            $schedule->save();

            return;
        }

        $message = (string) ($result['message'] ?? 'Unknown close fiscal day failure.');
        Log::warning('Fiscal schedule job: auto close failed', [
            'company_id' => $company->id,
            'schedule_id' => $schedule->id,
            'message' => $message,
        ]);

        throw new \RuntimeException($message);
    }
}
