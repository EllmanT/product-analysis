<?php

declare(strict_types=1);

use App\Enums\InvoiceStatus;

test('payable includes open and overdue', function () {
    expect(InvoiceStatus::payable())->toContain(InvoiceStatus::Open, InvoiceStatus::Overdue);
});

test('outstanding matches payable', function () {
    expect(InvoiceStatus::outstanding())->toBe(InvoiceStatus::payable());
});
