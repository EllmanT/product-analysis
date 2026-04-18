<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\FiscalCloudCompanyController;
use App\Http\Controllers\Api\FiscalCompanyApplyController;
use App\Http\Controllers\Api\NonFiscalizedCompanyController;
use App\Http\Controllers\Api\OAuthController;
use App\Http\Controllers\Api\UserActivationCodeController;
use App\Http\Controllers\AxisBilling\CheckoutSessionsController;
use App\Http\Controllers\AxisBilling\PlansController;
use App\Http\Controllers\AxisBilling\ProductsController;
use App\Http\Controllers\AxisBilling\SubscriptionsController;
use App\Http\Controllers\BankingDetailController;
use App\Http\Controllers\BuyerController;
use App\Http\Controllers\CompanyController;
use App\Http\Controllers\CompanyDeviceController;
use App\Http\Controllers\CompanyHsCodeController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\FiscalDayLogController;
use App\Http\Controllers\FiscalDayScheduleController;
use App\Http\Controllers\FiscalResponseController;
use App\Http\Controllers\HsCodeController;
use App\Http\Controllers\InvoiceController;
use App\Http\Controllers\InvoiceLineController;
use App\Http\Controllers\InvoiceTaxController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\TaxRateController;
use App\Http\Controllers\UnitOfMeasureController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\Webhooks\AxisBillingWebhookController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Protected routes use Laravel Sanctum (Bearer token).
|
*/

Route::post('webhooks/axis-billing', AxisBillingWebhookController::class);

Route::prefix('public')->group(function (): void {
    Route::get('oauth/{provider}/redirect', [OAuthController::class, 'redirect'])
        ->middleware('throttle:60,1');

    Route::get('oauth/{provider}/callback', [OAuthController::class, 'callback'])
        ->middleware('throttle:60,1');

    Route::post('register', [AuthController::class, 'register'])
        ->middleware('throttle:10,1');

    Route::post('login', [AuthController::class, 'login'])
        ->middleware('throttle:20,1');

    Route::post('login/activation-code', [AuthController::class, 'loginWithActivationCode'])
        ->middleware('throttle:30,1');

    Route::post('non-fiscalized-companies/register', [NonFiscalizedCompanyController::class, 'registerPublic'])
        ->middleware('throttle:10,1');

    Route::post('fiscal-cloud/companies', [FiscalCloudCompanyController::class, 'store'])
        ->middleware('throttle:10,1');
});

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('logout', [AuthController::class, 'logout']);
    Route::get('user', [AuthController::class, 'user']);

    Route::get('activation-code', [UserActivationCodeController::class, 'show']);
    Route::post('activation-code/regenerate', [UserActivationCodeController::class, 'regenerate']);

    Route::get('dashboard', DashboardController::class);
    Route::get('reports/sales', [ReportController::class, 'sales']);
    Route::get('reports/by-product', [ReportController::class, 'byProduct']);
    Route::get('reports/by-buyer', [ReportController::class, 'byBuyer']);

    Route::apiResource('companies', CompanyController::class);
    Route::apiResource('buyers', BuyerController::class);
    Route::apiResource('banking-details', BankingDetailController::class);
    Route::apiResource('company-devices', CompanyDeviceController::class);
    Route::post('company-devices/{id}/retry-activation', [CompanyDeviceController::class, 'retryActivation']);
    Route::apiResource('users', UserController::class);
    Route::apiResource('invoices', InvoiceController::class);
    Route::apiResource('invoice-lines', InvoiceLineController::class);
    Route::apiResource('invoice-taxes', InvoiceTaxController::class);
    Route::apiResource('fiscal-responses', FiscalResponseController::class);
    Route::apiResource('fiscal-day-logs', FiscalDayLogController::class);
    Route::apiResource('products', ProductController::class);
    Route::get('hs-codes', [HsCodeController::class, 'index']);
    Route::get('hs-codes/{hs_code}', [HsCodeController::class, 'show']);
    Route::get('company/hs-codes', [CompanyHsCodeController::class, 'index']);
    Route::put('company/hs-codes/preferences', [CompanyHsCodeController::class, 'syncPreferences']);
    Route::put('company/hs-codes/set-all', [CompanyHsCodeController::class, 'setAll']);

    Route::get('tax-rates', [TaxRateController::class, 'index']);
    Route::apiResource('units-of-measure', UnitOfMeasureController::class)->except(['show']);
    Route::get('settings/fiscal-day-schedule', [FiscalDayScheduleController::class, 'show']);
    Route::put('settings/fiscal-day-schedule', [FiscalDayScheduleController::class, 'update']);

    Route::post('invoices/{id}/fiscalize', [InvoiceController::class, 'fiscalize']);
    Route::get('fiscal/day/status', [InvoiceController::class, 'fiscalDayStatus']);
    Route::post('fiscal/day/open', [InvoiceController::class, 'openFiscalDay']);
    Route::post('fiscal/day/close', [InvoiceController::class, 'closeFiscalDay']);

    Route::post('non-fiscalized-companies', [NonFiscalizedCompanyController::class, 'register']);
    Route::post('non-fiscalized-companies/complete-profile', [NonFiscalizedCompanyController::class, 'completeProfile']);
    Route::get('non-fiscalized-companies/me', [NonFiscalizedCompanyController::class, 'me']);
    Route::get('non-fiscalized-companies/{id}', [NonFiscalizedCompanyController::class, 'show']);

    Route::post('fiscal-companies/apply', [FiscalCompanyApplyController::class, 'apply'])
        ->middleware('throttle:10,1');

    Route::prefix('axis-billing')->group(function (): void {
        Route::get('products', [ProductsController::class, 'index']);
        Route::get('products/{product}', [ProductsController::class, 'show']);

        Route::get('plans', [PlansController::class, 'index']);
        Route::get('plans/{plan}', [PlansController::class, 'show']);

        Route::post('checkout-sessions', [CheckoutSessionsController::class, 'store']);

        Route::get('subscriptions', [SubscriptionsController::class, 'index']);
        Route::get('subscriptions/{subscription}', [SubscriptionsController::class, 'show']);
        Route::post('subscriptions', [SubscriptionsController::class, 'store']);
        Route::patch('subscriptions/{subscription}', [SubscriptionsController::class, 'update']);
        Route::delete('subscriptions/{subscription}', [SubscriptionsController::class, 'destroy']);

        Route::get('customers/{customer}/subscriptions', [SubscriptionsController::class, 'byCustomer']);
        Route::post('subscriptions/{subscription}/activate', [SubscriptionsController::class, 'activate']);
        Route::post('subscriptions/{subscription}/cancel', [SubscriptionsController::class, 'cancel']);
        Route::post('subscriptions/{subscription}/renew', [SubscriptionsController::class, 'renew']);
        Route::post('subscriptions/{subscription}/transition-status', [SubscriptionsController::class, 'transitionStatus']);
    });
});
