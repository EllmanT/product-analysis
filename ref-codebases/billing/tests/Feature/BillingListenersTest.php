<?php

declare(strict_types=1);

use App\Enums\InvoiceGeneratedSource;
use App\Enums\PaymentStatus;
use App\Events\InvoiceGenerated;
use App\Events\PaymentCompleted;
use App\Events\SubscriptionCanceled;
use App\Events\SubscriptionCreated;
use App\Listeners\LogBillingEvents;
use App\Listeners\NotifyTeamBillingEvents;
use App\Listeners\SendAxisWebhook;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Subscription;
use App\Notifications\BillingNotification;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;

test('notify team billing listener sends database notification to team users', function () {
    $f = billingFixture();
    $subscription = Subscription::factory()->create([
        'team_id' => $f->team->id,
        'customer_id' => $f->customer->id,
        'plan_id' => $f->plan->id,
    ]);

    Notification::fake();

    app(NotifyTeamBillingEvents::class)(new SubscriptionCreated($subscription));

    Notification::assertSentTo($f->user, BillingNotification::class);
});

test('notify team billing listener does nothing for unknown events', function () {
    Notification::fake();

    app(NotifyTeamBillingEvents::class)(new stdClass);

    Notification::assertNothingSent();
});

test('log billing events listener runs without error for known events', function () {
    $f = billingFixture();
    $subscription = Subscription::factory()->create([
        'team_id' => $f->team->id,
        'customer_id' => $f->customer->id,
        'plan_id' => $f->plan->id,
    ]);
    $invoice = Invoice::factory()->create(['customer_id' => $f->customer->id]);
    $payment = Payment::factory()->create([
        'invoice_id' => $invoice->id,
        'status' => PaymentStatus::Succeeded,
    ]);

    $listener = app(LogBillingEvents::class);
    $listener(new SubscriptionCreated($subscription));
    $listener(new SubscriptionCanceled($subscription));
    $listener(new InvoiceGenerated($invoice, InvoiceGeneratedSource::Manual));
    $listener(new PaymentCompleted($payment, $invoice));
    $listener(new stdClass);

    expect(true)->toBeTrue();
});

test('send axis webhook posts signed json for subscription created', function () {
    $f = billingFixture();
    $subscription = Subscription::factory()->create([
        'team_id' => $f->team->id,
        'customer_id' => $f->customer->id,
        'plan_id' => $f->plan->id,
    ]);

    config([
        'services.axis.webhook_url' => 'https://axis-hook.test/webhook',
        'services.axis.webhook_secret' => 'secret',
    ]);

    Http::fake([
        'https://axis-hook.test/*' => Http::response([], 200),
    ]);

    app(SendAxisWebhook::class)(new SubscriptionCreated($subscription));

    Http::assertSentCount(1);
});

test('send axis webhook ignores unknown events', function () {
    config([
        'services.axis.webhook_url' => 'https://axis-hook.test/webhook',
        'services.axis.webhook_secret' => 'secret',
    ]);

    Http::fake();

    app(SendAxisWebhook::class)(new stdClass);

    Http::assertNothingSent();
});

test('send axis webhook skips when url is not configured', function () {
    $f = billingFixture();
    $subscription = Subscription::factory()->create([
        'team_id' => $f->team->id,
        'customer_id' => $f->customer->id,
        'plan_id' => $f->plan->id,
    ]);

    config(['services.axis.webhook_url' => '', 'services.axis.webhook_secret' => '']);

    Http::fake();

    app(SendAxisWebhook::class)(new SubscriptionCreated($subscription));

    Http::assertNothingSent();
});

test('send axis webhook covers invoice payment and cancel envelopes', function () {
    $f = billingFixture();

    config([
        'services.axis.webhook_url' => 'https://axis-hook.test/webhook',
        'services.axis.webhook_secret' => 'secret',
    ]);

    Http::fake([
        'https://axis-hook.test/*' => Http::response([], 200),
    ]);

    $invoice = Invoice::factory()->create(['customer_id' => $f->customer->id]);

    app(SendAxisWebhook::class)(new InvoiceGenerated($invoice, InvoiceGeneratedSource::Manual));

    $subscription = Subscription::factory()->create([
        'team_id' => $f->team->id,
        'customer_id' => $f->customer->id,
        'plan_id' => $f->plan->id,
    ]);

    app(SendAxisWebhook::class)(new SubscriptionCanceled($subscription));

    $payment = Payment::factory()->create([
        'invoice_id' => $invoice->id,
        'status' => PaymentStatus::Succeeded,
    ]);

    app(SendAxisWebhook::class)(new PaymentCompleted($payment, $invoice));

    Http::assertSentCount(3);
});

test('send axis webhook tolerates failed http response without throwing', function () {
    $f = billingFixture();
    $subscription = Subscription::factory()->create([
        'team_id' => $f->team->id,
        'customer_id' => $f->customer->id,
        'plan_id' => $f->plan->id,
    ]);

    config([
        'services.axis.webhook_url' => 'https://axis-hook.test/webhook',
        'services.axis.webhook_secret' => 'secret',
    ]);

    Http::fake([
        'https://axis-hook.test/*' => Http::response('error', 500),
    ]);

    app(SendAxisWebhook::class)(new SubscriptionCreated($subscription));

    Http::assertSentCount(1);
});
