<?php

declare(strict_types=1);

namespace App\Providers;

use App\Events\InvoiceGenerated;
use App\Events\PaymentCompleted;
use App\Events\SubscriptionCanceled;
use App\Events\SubscriptionCreated;
use App\Listeners\FinalizeCheckoutSessionOnPaymentCompleted;
use App\Listeners\LogBillingEvents;
use App\Listeners\NotifyTeamBillingEvents;
use App\Listeners\SendAxisWebhook;
use App\Listeners\SendPaymentSuccessNotificationEmails;
use Illuminate\Foundation\Support\Providers\EventServiceProvider as ServiceProvider;

final class EventServiceProvider extends ServiceProvider
{
    /**
     * @var array<class-string, array<int, class-string>>
     */
    protected $listen = [
        SubscriptionCreated::class => [
            LogBillingEvents::class,
            NotifyTeamBillingEvents::class,
            SendAxisWebhook::class,
        ],
        SubscriptionCanceled::class => [
            LogBillingEvents::class,
            NotifyTeamBillingEvents::class,
            SendAxisWebhook::class,
        ],
        InvoiceGenerated::class => [
            LogBillingEvents::class,
            NotifyTeamBillingEvents::class,
            SendAxisWebhook::class,
        ],
        PaymentCompleted::class => [
            LogBillingEvents::class,
            NotifyTeamBillingEvents::class,
            FinalizeCheckoutSessionOnPaymentCompleted::class,
            SendPaymentSuccessNotificationEmails::class,
            SendAxisWebhook::class,
        ],
    ];
}
