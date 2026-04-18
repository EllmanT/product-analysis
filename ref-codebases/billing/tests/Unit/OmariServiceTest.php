<?php

declare(strict_types=1);

use App\Services\OmariService;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    config([
        'omari.merchant_api_key' => 'test-merchant-key',
        'omari.merchant_base_url' => 'https://omari.test',
        'omari.timeout' => 5,
        'omari.connect_timeout' => 2,
    ]);
});

test('describeResponseCode maps known codes and defaults', function () {
    expect(OmariService::describeResponseCode('000'))->toBe('APPROVED')
        ->and(OmariService::describeResponseCode('unknown'))->toBe('UNKNOWN');
});

test('merchantBaseUrl uses override when set', function () {
    config(['omari.merchant_base_url' => 'https://custom.example/api']);

    expect(app(OmariService::class)->merchantBaseUrl())->toBe('https://custom.example/api');
});

test('merchantBaseUrl falls back to uat or prod from config', function () {
    config(['omari.merchant_base_url' => null]);

    config(['omari.production' => false]);
    expect(app(OmariService::class)->merchantBaseUrl())->toContain('uat');

    config(['omari.production' => true]);
    expect(app(OmariService::class)->merchantBaseUrl())->not->toContain('uat');
});

test('omari client methods decode successful json responses', function () {
    Http::fake([
        'https://omari.test/auth' => Http::response(['ok' => true], 200),
        'https://omari.test/requests' => Http::response(['paymentReference' => 'p1'], 200),
        'https://omari.test/query/ref-1' => Http::response(['status' => 'ok'], 200),
        'https://omari.test/void' => Http::response(['voided' => true], 200),
    ]);

    $service = app(OmariService::class);

    expect($service->authenticate(['msisdn' => '1', 'reference' => 'r', 'amount' => 1, 'currency' => 'USD', 'channel' => 'WEB']))
        ->toHaveKey('ok');
    expect($service->submitRequest(['msisdn' => '1', 'reference' => 'r', 'otp' => '1234']))
        ->toHaveKey('paymentReference');
    expect($service->query('ref-1'))->toHaveKey('status');
    expect($service->voidPayment(['reference' => 'ref-1']))->toHaveKey('voided');
});

test('omari client throws on http error', function () {
    Http::fake([
        'https://omari.test/auth' => Http::response('nope', 500),
    ]);

    expect(fn () => app(OmariService::class)->authenticate([
        'msisdn' => '1',
        'reference' => 'r',
        'amount' => 1,
        'currency' => 'USD',
        'channel' => 'WEB',
    ]))->toThrow(RuntimeException::class);
});

test('omari client throws when response body is not json object', function () {
    Http::fake([
        'https://omari.test/auth' => Http::response('plain', 200, ['Content-Type' => 'text/plain']),
    ]);

    expect(fn () => app(OmariService::class)->authenticate([
        'msisdn' => '1',
        'reference' => 'r',
        'amount' => 1,
        'currency' => 'USD',
        'channel' => 'WEB',
    ]))->toThrow(RuntimeException::class);
});

test('omari client throws when api key missing', function () {
    config(['omari.merchant_api_key' => '']);

    expect(fn () => app(OmariService::class)->authenticate([
        'msisdn' => '1',
        'reference' => 'r',
        'amount' => 1,
        'currency' => 'USD',
        'channel' => 'WEB',
    ]))->toThrow(RuntimeException::class);
});
