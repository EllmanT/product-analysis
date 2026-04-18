<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;

beforeEach(function (): void {
    Schema::dropIfExists('axis_webhook_deliveries');
    Schema::dropIfExists('external_subscriptions');

    Schema::create('axis_webhook_deliveries', function (Blueprint $table): void {
        $table->id();
        $table->string('payload_hash', 64)->unique();
        $table->longText('payload');
        $table->timestamps();
    });

    Schema::create('external_subscriptions', function (Blueprint $table): void {
        $table->id();
        $table->string('axis_subscription_id')->unique();
        $table->integer('team_id')->nullable();
        $table->integer('customer_id')->nullable();
        $table->integer('plan_id')->nullable();
        $table->string('status');
        $table->timestamps();
    });
});

it('verifies signature, upserts subscription, and is idempotent', function (): void {
    config()->set('services.axis_billing.webhook_secret', 'test-secret');

    $payload = [
        'type' => 'subscription.created',
        'occurred_at' => '2026-04-07T12:00:00Z',
        'data' => [
            'subscription_id' => 'sub_123',
            'team_id' => 10,
            'customer_id' => 20,
            'plan_id' => 30,
            'status' => 'active',
        ],
    ];

    $raw = json_encode($payload, JSON_THROW_ON_ERROR);
    $signature = hash_hmac('sha256', $raw, 'test-secret');

    $res1 = $this
        ->withHeader('X-Axis-Signature', $signature)
        ->postJson('/api/webhooks/axis-billing', $payload);

    $res1->assertOk();

    expect(DB::table('external_subscriptions')->count())->toBe(1);
    expect(DB::table('axis_webhook_deliveries')->count())->toBe(1);

    $row = DB::table('external_subscriptions')->where('axis_subscription_id', 'sub_123')->first();
    expect($row)->not->toBeNull();
    expect($row->team_id)->toBe(10);
    expect($row->customer_id)->toBe(20);
    expect($row->plan_id)->toBe(30);
    expect($row->status)->toBe('active');

    $res2 = $this
        ->withHeader('X-Axis-Signature', $signature)
        ->postJson('/api/webhooks/axis-billing', $payload);

    $res2->assertOk();
    expect(DB::table('external_subscriptions')->count())->toBe(1);
    expect(DB::table('axis_webhook_deliveries')->count())->toBe(1);
});

it('returns 401 on invalid signature', function (): void {
    config()->set('services.axis_billing.webhook_secret', 'test-secret');

    $payload = [
        'type' => 'subscription.created',
        'occurred_at' => '2026-04-07T12:00:00Z',
        'data' => [
            'subscription_id' => 'sub_999',
            'team_id' => 1,
            'customer_id' => 2,
            'plan_id' => 3,
            'status' => 'active',
        ],
    ];

    $this
        ->withHeader('X-Axis-Signature', 'bad-signature')
        ->postJson('/api/webhooks/axis-billing', $payload)
        ->assertStatus(401);
});

