<?php

declare(strict_types=1);

use App\Services\ZimswitchPaymentStatusMapper;
use Illuminate\Support\Collection;

test('zimswitch status mapper categorizes representative result codes', function () {
    $mapper = app(ZimswitchPaymentStatusMapper::class);

    expect($mapper->getStatusCategory('000.000.000'))->toBe('success')
        ->and($mapper->getStatusCategory('000.400.000'))->toBe('success_review')
        ->and($mapper->getStatusCategory('000.200.000'))->toBe('pending')
        ->and($mapper->getStatusCategory('800.400.500'))->toBe('pending_delayed')
        ->and($mapper->getStatusCategory('800.100.100'))->toBe('rejected')
        ->and($mapper->getStatusCategory('111.999.999'))->toBe('unknown');
});

test('zimswitch status mapper exposes getters used by copy pay service', function () {
    $mapper = app(ZimswitchPaymentStatusMapper::class);

    expect($mapper->isSuccess('000.000.100'))->toBeTrue()
        ->and($mapper->isRejected3DS('000.400.111'))->toBeTrue()
        ->and($mapper->isRejectedBank('800.100.200'))->toBeTrue()
        ->and($mapper->isRejectedCommunication('900.100.000'))->toBeTrue()
        ->and($mapper->isRejectedSystem('800.500.000'))->toBeTrue()
        ->and($mapper->isRejectedAsync('100.397.000'))->toBeTrue()
        ->and($mapper->isSoftDecline('300.100.100'))->toBeTrue()
        ->and($mapper->isAnyPending('000.200.100'))->toBeTrue();
});

test('zimswitch status mapper summary includes description from bundled json when present', function () {
    $mapper = app(ZimswitchPaymentStatusMapper::class);
    $summary = $mapper->getStatusSummary('000.000.000');

    expect($summary)->toContain('Transaction succeeded');
});

test('zimswitch status mapper getAll returns a collection', function () {
    $mapper = app(ZimswitchPaymentStatusMapper::class);

    expect($mapper->getAll())->toBeInstanceOf(Collection::class);
});
