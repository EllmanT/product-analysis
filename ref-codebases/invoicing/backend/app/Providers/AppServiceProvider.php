<?php

namespace App\Providers;

use App\Models\User;
use App\Settings\ApplicationSettings;
use App\Settings\IntegrationSettings;
use Dedoc\Scramble\Scramble;
use Dedoc\Scramble\Support\Generator\OpenApi;
use Dedoc\Scramble\Support\Generator\SecurityScheme;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
        $this->app->bind(\App\Repositories\Interfaces\CompanyRepositoryInterface::class, \App\Repositories\CompanyRepository::class);

        $this->app->bind(\App\Repositories\Interfaces\CompanyDeviceRepositoryInterface::class, \App\Repositories\CompanyDeviceRepository::class);

        $this->app->bind(\App\Repositories\Interfaces\BankingDetailRepositoryInterface::class, \App\Repositories\BankingDetailRepository::class);

        $this->app->bind(\App\Repositories\Interfaces\BuyerRepositoryInterface::class, \App\Repositories\BuyerRepository::class);

        $this->app->bind(\App\Repositories\Interfaces\ProductRepositoryInterface::class, \App\Repositories\ProductRepository::class);

        $this->app->bind(\App\Repositories\Interfaces\HsCodeRepositoryInterface::class, \App\Repositories\HsCodeRepository::class);

        $this->app->bind(\App\Repositories\Interfaces\InvoiceRepositoryInterface::class, \App\Repositories\InvoiceRepository::class);

        $this->app->bind(\App\Repositories\Interfaces\InvoiceLineRepositoryInterface::class, \App\Repositories\InvoiceLineRepository::class);

        $this->app->bind(\App\Repositories\Interfaces\InvoiceTaxRepositoryInterface::class, \App\Repositories\InvoiceTaxRepository::class);

        $this->app->bind(\App\Repositories\Interfaces\FiscalResponseRepositoryInterface::class, \App\Repositories\FiscalResponseRepository::class);

        $this->app->bind(\App\Repositories\Interfaces\FiscalDayLogRepositoryInterface::class, \App\Repositories\FiscalDayLogRepository::class);

        $this->app->bind(\App\Repositories\Interfaces\UserRepositoryInterface::class, \App\Repositories\UserRepository::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if (Schema::hasTable('settings')) {
            try {
                /** @var ApplicationSettings $appSettings */
                $appSettings = app(ApplicationSettings::class);
                config([
                    'app.name' => $appSettings->app_name,
                    'app.url' => $appSettings->app_url,
                    'app.debug' => $appSettings->app_debug,
                    'app.timezone' => $appSettings->timezone,
                ]);
            } catch (\Throwable) {
                // Settings not migrated yet or empty repository.
            }

            try {
                /** @var IntegrationSettings $integration */
                $integration = app(IntegrationSettings::class);
                config([
                    'services.zimra.api_url' => $integration->zimra_api_url,
                    'fiscalcloud.base_url' => rtrim($integration->fiscalcloud_api_url, '/'),
                    'fiscalcloud.timeout' => $integration->fiscalcloud_api_timeout,
                    'fiscalcloud.api_key' => $integration->fiscalcloud_api_key !== '' ? $integration->fiscalcloud_api_key : null,
                    'services.docs_ai.base_url' => $integration->docs_ai_url !== '' ? rtrim($integration->docs_ai_url, '/') : (string) config('services.docs_ai.base_url', ''),
                    'services.axis_billing.base_url' => $integration->axis_billing_base_url,
                    'services.axis_billing.api_key' => $integration->axis_billing_api_key,
                    'services.axis_billing.webhook_secret' => $integration->axis_billing_webhook_secret,
                    'services.axis_billing.team_id' => $integration->axis_billing_team_id !== '' ? $integration->axis_billing_team_id : null,
                ]);
            } catch (\Throwable) {
                // Integration settings group not migrated yet.
            }
        }

        Scramble::registerApi('v1', [
            'api_path' => 'api/v1',
        ]);

        Scramble::afterOpenApiGenerated(function (OpenApi $openApi) {
            $openApi->secure(
                SecurityScheme::http('bearer')
            );
        });

        Gate::define('viewApiDocs', function (User $user) {
            return $user;
        });
    }
}
