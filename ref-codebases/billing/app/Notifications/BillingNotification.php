<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

final class BillingNotification extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * @param  array<string, string|int|float|null>  $payload
     */
    public function __construct(
        public readonly string $title,
        public readonly array $payload,
    ) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->subject($this->title);

        foreach ($this->payload as $key => $value) {
            $mail->line(sprintf('%s: %s', $key, $value === null ? '—' : (string) $value));
        }

        return $mail;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'title' => $this->title,
            'payload' => $this->payload,
        ];
    }
}
