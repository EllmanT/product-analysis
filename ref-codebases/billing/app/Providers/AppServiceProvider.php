<?php

namespace App\Providers;

use App\Filesystem\Filesystem;
use App\Services\CustomerService;
use App\Services\ExceptionReporter;
use App\Services\InvoiceItemService;
use App\Services\InvoiceService;
use App\Services\PaymentService;
use App\Services\PlanService;
use App\Services\ProductService;
use App\Services\SubscriptionService;
use App\Services\UserService;
use App\Settings\ApplicationSettings;
use App\Settings\EcoCashSettings;
use App\Settings\MailSettings;
use App\Settings\OmariSettings;
use App\Settings\ZimswitchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;
use Throwable;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton('files', fn (): Filesystem => new Filesystem);

        $this->app->singleton(ExceptionReporter::class);

        $this->app->singleton(SubscriptionService::class);
        $this->app->singleton(InvoiceService::class);
        $this->app->singleton(PaymentService::class);
        $this->app->singleton(CustomerService::class);
        $this->app->singleton(ProductService::class);
        $this->app->singleton(PlanService::class);
        $this->app->singleton(InvoiceItemService::class);
        $this->app->singleton(UserService::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();
        $this->configureBillingApiRateLimiting();
        $this->configureApplicationFromSettings();
        $this->configureGatewayConfigFromSettings();
        $this->configureMailFromSettings();
    }

    /**
     * Apply Application settings (name, URL, debug, timezone) from System configuration.
     */
    private function configureApplicationFromSettings(): void
    {
        try {
            if (! Schema::hasTable('settings')) {
                return;
            }

            /** @var ApplicationSettings $app */
            $app = app(ApplicationSettings::class);

            config([
                'app.name' => $app->name,
                'app.url' => rtrim($app->url, '/'),
                'app.debug' => $app->debug,
                'app.timezone' => $app->timezone,
            ]);
        } catch (Throwable) {
            return;
        }
    }

    /**
     * Bridge Settings → config() for the rest of the app.
     *
     * This keeps sensitive/env-specific values out of `.env` while allowing existing
     * code (and tests) that read config('ecocash.*') / config('zimswitch.*') / config('omari.*')
     * to keep working.
     */
    private function configureGatewayConfigFromSettings(): void
    {
        try {
            if (! Schema::hasTable('settings')) {
                return;
            }

            /** @var EcoCashSettings $eco */
            $eco = app(EcoCashSettings::class);
            /** @var ZimswitchSettings $zim */
            $zim = app(ZimswitchSettings::class);
            /** @var OmariSettings $om */
            $om = app(OmariSettings::class);

            config([
                'ecocash.api_url' => $eco->api_url,
                'ecocash.notify_url' => $eco->notify_url,
                'ecocash.username' => $eco->username,
                'ecocash.password' => $eco->password,
                'ecocash.merchant_code' => $eco->merchant_code,
                'ecocash.merchant_pin' => $eco->merchant_pin,
                'ecocash.terminal_id' => $eco->terminal_id,
                'ecocash.location' => $eco->location,
                'ecocash.super_merchant' => $eco->super_merchant,
                'ecocash.merchant_name' => $eco->merchant_name,
                'ecocash.currency' => $eco->currency,

                'zimswitch.base_url' => $zim->base_url,
                'zimswitch.authorization_token' => $zim->authorization_token,
                'zimswitch.payment_type' => $zim->payment_type,
                'zimswitch.test_mode_header' => $zim->test_mode_header,
                'zimswitch.verify_ssl' => $zim->verify_ssl,
                'zimswitch.timeout' => $zim->timeout,
                'zimswitch.connect_timeout' => $zim->connect_timeout,
                'zimswitch.payment_options' => $zim->payment_options,

                'omari.merchant_api_key' => $om->merchant_api_key,
                'omari.production' => $om->production,
                'omari.merchant_base_url' => $om->merchant_base_url,
                'omari.timeout' => $om->timeout,
                'omari.connect_timeout' => $om->connect_timeout,
            ]);
        } catch (Throwable) {
            // If settings are misconfigured, keep env/config defaults.
            return;
        }
    }

    /**
     * Apply Mail settings so outbound mail uses the values from System configuration.
     */
    private function configureMailFromSettings(): void
    {
        try {
            if (! Schema::hasTable('settings')) {
                return;
            }

            /** @var MailSettings $mail */
            $mail = app(MailSettings::class);

            config([
                'mail.default' => $mail->default_mailer,
                'mail.mailers.smtp.scheme' => $mail->smtp_scheme,
                'mail.mailers.smtp.host' => $mail->smtp_host,
                'mail.mailers.smtp.port' => $mail->smtp_port,
                'mail.mailers.smtp.username' => $mail->smtp_username,
                'mail.mailers.smtp.password' => $mail->smtp_password,
                'mail.from.address' => $mail->from_address,
                'mail.from.name' => $mail->from_name,
            ]);
        } catch (Throwable) {
            return;
        }
    }

    protected function configureBillingApiRateLimiting(): void
    {
        RateLimiter::for('billing-api', function (Request $request): Limit {
            $perMinute = max(1, (int) config('billing.api_rate_limit', 120));
            $user = $request->user();
            $key = $user !== null ? 'user:'.$user->getAuthIdentifier() : 'ip:'.$request->ip();

            return Limit::perMinute($perMinute)->by($key);
        });
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }
}
