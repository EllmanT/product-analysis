<?php

namespace App\Console\Commands;

use App\Jobs\RunScheduledFiscalDayCloseJob;
use App\Jobs\RunScheduledFiscalDayOpenJob;
use App\Models\CompanyFiscalDaySchedule;
use Carbon\Carbon;
use Illuminate\Console\Command;

class ProcessFiscalDaySchedules extends Command
{
    protected $signature = 'fiscal:process-schedules';

    protected $description = 'Run scheduled fiscal day open/close (uses the configured ZIMRA virtual device).';

    public function handle(): int
    {
        $queuedClose = 0;
        $queuedOpen = 0;

        foreach (CompanyFiscalDaySchedule::query()->where('is_enabled', true)->with('company')->cursor() as $schedule) {
            $company = $schedule->company;
            if ($company === null || ! $company->is_active) {
                continue;
            }

            $tz = $schedule->timezone ?: config('app.timezone');
            $now = Carbon::now($tz);
            $today = $now->toDateString();

            if ($schedule->auto_close_enabled && $this->shouldFireClose($schedule, $now)) {
                RunScheduledFiscalDayCloseJob::dispatch($schedule->id, $today);
                $queuedClose++;
            }

            if ($schedule->auto_open_enabled && $this->shouldFireOpen($schedule, $now)) {
                RunScheduledFiscalDayOpenJob::dispatch($schedule->id, $today);
                $queuedOpen++;
            }
        }

        if ($queuedClose > 0 || $queuedOpen > 0) {
            $this->info("Fiscal schedules queued: {$queuedClose} close job(s), {$queuedOpen} open job(s).");
        }

        return self::SUCCESS;
    }

    private function shouldFireClose(CompanyFiscalDaySchedule $schedule, Carbon $now): bool
    {
        if ($schedule->close_time === null) {
            return false;
        }
        $weekdays = $schedule->close_weekdays ?? [];
        if ($weekdays === [] || ! $this->weekdayMatches($now, $weekdays)) {
            return false;
        }
        if (! $this->timeMatchesMinute($schedule->close_time, $now)) {
            return false;
        }
        $today = $now->toDateString();
        $last = $schedule->last_auto_close_date;
        if ($last !== null && $last->format('Y-m-d') === $today) {
            return false;
        }

        return true;
    }

    private function shouldFireOpen(CompanyFiscalDaySchedule $schedule, Carbon $now): bool
    {
        if ($schedule->open_time === null) {
            return false;
        }
        $weekdays = $schedule->open_weekdays ?? [];
        if ($weekdays === [] || ! $this->weekdayMatches($now, $weekdays)) {
            return false;
        }
        if (! $this->timeMatchesMinute($schedule->open_time, $now)) {
            return false;
        }
        $today = $now->toDateString();
        $last = $schedule->last_auto_open_date;
        if ($last !== null && $last->format('Y-m-d') === $today) {
            return false;
        }

        return true;
    }

    /**
     * @param  array<int, int|string>  $weekdays  ISO weekdays 1 (Mon) — 7 (Sun)
     */
    private function weekdayMatches(Carbon $now, array $weekdays): bool
    {
        $iso = $now->dayOfWeekIso;

        return collect($weekdays)->contains(fn ($d) => (int) $d === $iso);
    }

    private function timeMatchesMinute(mixed $stored, Carbon $now): bool
    {
        $t = $stored instanceof Carbon
            ? $stored->format('H:i')
            : Carbon::parse((string) $stored)->format('H:i');

        return $now->format('H:i') === $t;
    }
}
