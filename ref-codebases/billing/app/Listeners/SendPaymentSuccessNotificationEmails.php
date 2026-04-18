<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Events\PaymentCompleted;
use App\Mail\PaymentSucceededMail;
use App\Settings\PaymentNotificationSettings;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

final class SendPaymentSuccessNotificationEmails
{
    public function __construct(
        private readonly PaymentNotificationSettings $settings,
    ) {}

    public function handle(PaymentCompleted $event): void
    {
        if (! $this->settings->notify_on_success) {
            return;
        }

        $emails = array_values(array_unique(array_filter(
            $this->settings->success_notification_emails,
            static fn (mixed $e): bool => is_string($e) && filter_var($e, FILTER_VALIDATE_EMAIL) !== false
        )));

        if ($emails === []) {
            return;
        }

        try {
            Mail::to($emails)->queue(new PaymentSucceededMail($event->payment, $event->invoice));
        } catch (Throwable $e) {
            Log::warning('Payment success notification email failed.', [
                'payment_id' => $event->payment->id,
                'invoice_id' => $event->invoice->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
