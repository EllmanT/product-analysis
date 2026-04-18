<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Settings\ApplicationSettings;
use App\Settings\EcoCashSettings;
use App\Settings\MailSettings;
use App\Settings\OmariSettings;
use App\Settings\PaymentNotificationSettings;
use App\Settings\ZimswitchSettings;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class SystemConfigurationController extends Controller
{
    public function __construct(
        private readonly ApplicationSettings $application,
        private readonly MailSettings $mail,
        private readonly PaymentNotificationSettings $paymentNotifications,
        private readonly EcoCashSettings $ecocash,
        private readonly ZimswitchSettings $zimswitch,
        private readonly OmariSettings $omari,
    ) {}

    public function index(): Response
    {
        return Inertia::render('system-configuration/Index', [
            'application' => [
                'name' => $this->application->name,
                'url' => $this->application->url,
                'debug' => $this->application->debug,
                'timezone' => $this->application->timezone,
            ],
            'mail' => [
                'default_mailer' => $this->mail->default_mailer,
                'smtp_scheme' => $this->mail->smtp_scheme,
                'smtp_host' => $this->mail->smtp_host,
                'smtp_port' => $this->mail->smtp_port,
                'smtp_username' => $this->mail->smtp_username,
                'smtp_password_set' => $this->mail->smtp_password !== '',
                'from_address' => $this->mail->from_address,
                'from_name' => $this->mail->from_name,
            ],
            'payment_notifications' => [
                'notify_on_success' => $this->paymentNotifications->notify_on_success,
                'success_notification_emails' => $this->paymentNotifications->success_notification_emails,
            ],
            'ecocash' => [
                'api_url' => $this->ecocash->api_url,
                'notify_url' => $this->ecocash->notify_url,
                'username' => $this->ecocash->username,
                // don't leak secrets to the client
                'password_set' => $this->ecocash->password !== '',
                'merchant_code' => $this->ecocash->merchant_code,
                'merchant_pin_set' => $this->ecocash->merchant_pin !== '',
                'terminal_id' => $this->ecocash->terminal_id,
                'location' => $this->ecocash->location,
                'super_merchant' => $this->ecocash->super_merchant,
                'merchant_name' => $this->ecocash->merchant_name,
                'currency' => $this->ecocash->currency,
            ],
            'zimswitch' => [
                'base_url' => $this->zimswitch->base_url,
                'authorization_token_set' => $this->zimswitch->authorization_token !== '',
                'payment_type' => $this->zimswitch->payment_type,
                'test_mode_header' => $this->zimswitch->test_mode_header,
                'verify_ssl' => $this->zimswitch->verify_ssl,
                'timeout' => $this->zimswitch->timeout,
                'connect_timeout' => $this->zimswitch->connect_timeout,
                'payment_options' => $this->zimswitch->payment_options,
            ],
            'omari' => [
                'merchant_api_key_set' => $this->omari->merchant_api_key !== '',
                'production' => $this->omari->production,
                'merchant_base_url' => $this->omari->merchant_base_url,
                'timeout' => $this->omari->timeout,
                'connect_timeout' => $this->omari->connect_timeout,
            ],
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'application' => ['sometimes', 'array'],
            'mail' => ['sometimes', 'array'],
            'payment_notifications' => ['sometimes', 'array'],
            'ecocash' => ['sometimes', 'array'],
            'zimswitch' => ['sometimes', 'array'],
            'omari' => ['sometimes', 'array'],

            'application.name' => ['required_with:application', 'string', 'max:255'],
            'application.url' => ['required_with:application', 'url', 'max:2048'],
            'application.debug' => ['required_with:application', 'boolean'],
            'application.timezone' => ['required_with:application', 'timezone:all'],

            'mail.default_mailer' => ['required_with:mail', 'string', 'max:50'],
            'mail.smtp_scheme' => ['nullable', 'string', 'max:20'],
            'mail.smtp_host' => ['required_with:mail', 'string', 'max:255'],
            'mail.smtp_port' => ['required_with:mail', 'integer', 'min:1', 'max:65535'],
            'mail.smtp_username' => ['nullable', 'string', 'max:255'],
            'mail.smtp_password' => ['nullable', 'string', 'max:255'],
            'mail.from_address' => ['required_with:mail', 'string', 'email', 'max:255'],
            'mail.from_name' => ['required_with:mail', 'string', 'max:255'],

            'payment_notifications.notify_on_success' => ['required_with:payment_notifications', 'boolean'],
            'payment_notifications.success_notification_emails' => ['required_with:payment_notifications', 'array'],
            'payment_notifications.success_notification_emails.*' => ['nullable', 'string', 'email', 'max:255'],

            // EcoCash (validate only when ecocash is present)
            'ecocash.api_url' => ['required_with:ecocash', 'url', 'max:2048'],
            'ecocash.notify_url' => ['required_with:ecocash', 'url', 'max:2048'],
            'ecocash.username' => ['required_with:ecocash', 'string', 'max:255'],
            'ecocash.password' => ['nullable', 'string', 'max:255'],
            'ecocash.merchant_code' => ['required_with:ecocash', 'string', 'max:255'],
            'ecocash.merchant_pin' => ['nullable', 'string', 'max:255'],
            'ecocash.terminal_id' => ['required_with:ecocash', 'string', 'max:255'],
            'ecocash.location' => ['required_with:ecocash', 'string', 'max:255'],
            'ecocash.super_merchant' => ['required_with:ecocash', 'string', 'max:255'],
            'ecocash.merchant_name' => ['required_with:ecocash', 'string', 'max:255'],
            'ecocash.currency' => ['required_with:ecocash', 'string', 'max:10'],

            // Zimswitch (validate only when zimswitch is present)
            'zimswitch.base_url' => ['required_with:zimswitch', 'url', 'max:2048'],
            'zimswitch.authorization_token' => ['nullable', 'string', 'max:2048'],
            'zimswitch.payment_type' => ['required_with:zimswitch', 'string', 'max:20'],
            'zimswitch.test_mode_header' => ['nullable', 'string', 'max:50'],
            'zimswitch.verify_ssl' => ['required_with:zimswitch', 'boolean'],
            'zimswitch.timeout' => ['required_with:zimswitch', 'integer', 'min:1', 'max:120'],
            'zimswitch.connect_timeout' => ['required_with:zimswitch', 'integer', 'min:1', 'max:120'],
            'zimswitch.payment_options' => ['required_with:zimswitch', 'array', 'min:1'],
            'zimswitch.payment_options.*.label' => ['required_with:zimswitch.payment_options', 'string', 'max:100'],
            'zimswitch.payment_options.*.entity_id' => ['required_with:zimswitch.payment_options', 'string', 'max:100'],
            'zimswitch.payment_options.*.data_brands' => ['required_with:zimswitch.payment_options', 'string', 'max:100'],

            // Omari (validate only when omari is present)
            'omari.merchant_api_key' => ['nullable', 'string', 'max:2048'],
            'omari.production' => ['required_with:omari', 'boolean'],
            'omari.merchant_base_url' => ['nullable', 'url', 'max:2048'],
            'omari.timeout' => ['required_with:omari', 'integer', 'min:1', 'max:120'],
            'omari.connect_timeout' => ['required_with:omari', 'integer', 'min:1', 'max:120'],
        ]);

        if (isset($validated['application']) && is_array($validated['application'])) {
            $a = $validated['application'];
            $this->application->name = $a['name'];
            $this->application->url = rtrim((string) $a['url'], '/');
            $this->application->debug = (bool) $a['debug'];
            $this->application->timezone = $a['timezone'];
            $this->application->save();
        }

        if (isset($validated['mail']) && is_array($validated['mail'])) {
            $m = $validated['mail'];
            $this->mail->default_mailer = $m['default_mailer'];
            $this->mail->smtp_scheme = ($m['smtp_scheme'] ?? null) === '' ? null : ($m['smtp_scheme'] ?? null);
            $this->mail->smtp_host = $m['smtp_host'];
            $this->mail->smtp_port = (int) $m['smtp_port'];
            $this->mail->smtp_username = ($m['smtp_username'] ?? null) === '' ? null : ($m['smtp_username'] ?? null);
            if (($m['smtp_password'] ?? null) !== null && $m['smtp_password'] !== '') {
                $this->mail->smtp_password = $m['smtp_password'];
            }
            $this->mail->from_address = $m['from_address'];
            $this->mail->from_name = $m['from_name'];
            $this->mail->save();
        }

        if (isset($validated['payment_notifications']) && is_array($validated['payment_notifications'])) {
            $pn = $validated['payment_notifications'];
            $this->paymentNotifications->notify_on_success = (bool) ($pn['notify_on_success'] ?? false);
            $emails = $pn['success_notification_emails'] ?? [];
            $this->paymentNotifications->success_notification_emails = is_array($emails)
                ? array_values(array_unique(array_filter($emails, static fn ($e) => is_string($e) && $e !== '')))
                : [];
            $this->paymentNotifications->save();
        }

        if (isset($validated['ecocash']) && is_array($validated['ecocash'])) {
            $eco = $validated['ecocash'];
            $this->ecocash->api_url = $eco['api_url'];
            $this->ecocash->notify_url = $eco['notify_url'];
            $this->ecocash->username = $eco['username'];
            $this->ecocash->merchant_code = $eco['merchant_code'];
            $this->ecocash->terminal_id = $eco['terminal_id'];
            $this->ecocash->location = $eco['location'];
            $this->ecocash->super_merchant = $eco['super_merchant'];
            $this->ecocash->merchant_name = $eco['merchant_name'];
            $this->ecocash->currency = strtoupper($eco['currency']);

            // only overwrite secrets when provided
            if (($eco['password'] ?? null) !== null && $eco['password'] !== '') {
                $this->ecocash->password = $eco['password'];
            }
            if (($eco['merchant_pin'] ?? null) !== null && $eco['merchant_pin'] !== '') {
                $this->ecocash->merchant_pin = $eco['merchant_pin'];
            }

            $this->ecocash->save();
        }

        if (isset($validated['zimswitch']) && is_array($validated['zimswitch'])) {
            $zim = $validated['zimswitch'];
            $this->zimswitch->base_url = rtrim($zim['base_url'], '/');
            if (($zim['authorization_token'] ?? null) !== null && $zim['authorization_token'] !== '') {
                $this->zimswitch->authorization_token = $zim['authorization_token'];
            }
            $this->zimswitch->payment_type = $zim['payment_type'];
            $this->zimswitch->test_mode_header = $zim['test_mode_header'] ?? null;
            $this->zimswitch->verify_ssl = (bool) $zim['verify_ssl'];
            $this->zimswitch->timeout = (int) $zim['timeout'];
            $this->zimswitch->connect_timeout = (int) $zim['connect_timeout'];
            $this->zimswitch->payment_options = $zim['payment_options'];
            $this->zimswitch->save();
        }

        if (isset($validated['omari']) && is_array($validated['omari'])) {
            $om = $validated['omari'];
            if (($om['merchant_api_key'] ?? null) !== null && $om['merchant_api_key'] !== '') {
                $this->omari->merchant_api_key = $om['merchant_api_key'];
            }
            $this->omari->production = (bool) $om['production'];
            $this->omari->merchant_base_url = $om['merchant_base_url'] ?? null;
            $this->omari->timeout = (int) $om['timeout'];
            $this->omari->connect_timeout = (int) $om['connect_timeout'];
            $this->omari->save();
        }

        return redirect()->back()->with('success', 'System configuration updated.');
    }
}
