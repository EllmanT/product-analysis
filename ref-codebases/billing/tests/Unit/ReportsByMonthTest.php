<?php

declare(strict_types=1);

use App\Support\ReportsByMonth;
use Carbon\Carbon;
use Illuminate\Support\Collection;

test('sumAmountByYearMonth aggregates by Y-m', function () {
    $rows = new Collection([
        (object) ['amount' => '10.00', 'created_at' => Carbon::parse('2026-01-15')],
        (object) ['amount' => '5.50', 'created_at' => Carbon::parse('2026-01-20')],
        (object) ['amount' => '2.00', 'created_at' => Carbon::parse('2026-02-01')],
    ]);

    $map = ReportsByMonth::sumAmountByYearMonth($rows);

    expect($map['2026-01'])->toBe(15.5)
        ->and($map['2026-02'])->toBe(2.0);
});

test('countByYearMonth counts rows', function () {
    $rows = new Collection([
        (object) ['created_at' => Carbon::parse('2026-03-01')],
        (object) ['created_at' => Carbon::parse('2026-03-10')],
    ]);

    $map = ReportsByMonth::countByYearMonth($rows);

    expect($map['2026-03'])->toBe(2);
});

test('countByUpdatedYearMonth uses updated_at', function () {
    $rows = new Collection([
        (object) ['updated_at' => Carbon::parse('2026-04-01')],
    ]);

    $map = ReportsByMonth::countByUpdatedYearMonth($rows);

    expect($map['2026-04'])->toBe(1);
});
