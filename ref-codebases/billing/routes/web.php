<?php

use App\Http\Controllers\ApiKeyController;
use App\Http\Controllers\AuditTrailController;
use App\Http\Controllers\Auth\AuthenticatedSessionController;
use App\Http\Controllers\BillingIntervalConfigController;
use App\Http\Controllers\BillingIntervalController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\EcoCashController;
use App\Http\Controllers\ExchangeRateController;
use App\Http\Controllers\InvoiceController;
use App\Http\Controllers\InvoiceItemController;
use App\Http\Controllers\LegalController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PlanController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\PublicCheckoutController;
use App\Http\Controllers\Reports\CustomerReportController;
use App\Http\Controllers\Reports\InvoiceReportController;
use App\Http\Controllers\Reports\RevenueReportController;
use App\Http\Controllers\Reports\SubscriptionReportController;
use App\Http\Controllers\SubscriptionController;
use App\Http\Controllers\SystemConfigurationController;
use App\Http\Controllers\TeamController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\WelcomeController;
use App\Http\Controllers\ZimswitchController;
use Illuminate\Support\Facades\Route;

Route::get('/', WelcomeController::class)->name('home');

Route::get('/privacy-policy', [LegalController::class, 'privacyPolicy'])->name('privacy-policy');
Route::get('/terms', [LegalController::class, 'terms'])->name('terms');

// Public hosted checkout (no auth/session required)
Route::get('/pay/{publicId}', [PublicCheckoutController::class, 'show'])->name('public.checkout.show');
Route::get('/pay/{publicId}/status', [PublicCheckoutController::class, 'status'])->name('public.checkout.status');
Route::post('/pay/{publicId}/zimswitch/start', [PublicCheckoutController::class, 'startZimswitch'])->name('public.checkout.zimswitch.start');
Route::get('/pay/{publicId}/zimswitch/widget', [PublicCheckoutController::class, 'zimswitchWidget'])->name('public.checkout.zimswitch.widget');
Route::get('/pay/{publicId}/zimswitch/return', [PublicCheckoutController::class, 'zimswitchReturn'])->name('public.checkout.zimswitch.return');
Route::get('/pay/{publicId}/ecocash', [PublicCheckoutController::class, 'ecocashForm'])->name('public.checkout.ecocash.form');
Route::post('/pay/{publicId}/ecocash/start', [PublicCheckoutController::class, 'startEcocash'])->name('public.checkout.ecocash.start');
Route::get('/pay/{publicId}/ecocash/wait', [PublicCheckoutController::class, 'ecocashWait'])->name('public.checkout.ecocash.wait');
Route::get('/pay/{publicId}/omari', [PublicCheckoutController::class, 'omariForm'])->name('public.checkout.omari.form');
Route::post('/pay/{publicId}/omari/auth', [PublicCheckoutController::class, 'startOmariAuth'])->name('public.checkout.omari.auth');
Route::post('/pay/{publicId}/omari/confirm', [PublicCheckoutController::class, 'confirmOmariOtp'])->name('public.checkout.omari.confirm');
Route::get('/pay/{publicId}/complete', [PublicCheckoutController::class, 'complete'])->name('public.checkout.complete');

Route::middleware('guest')->group(function () {
    Route::get('login', [AuthenticatedSessionController::class, 'create'])->name('login');
    Route::post('login', [AuthenticatedSessionController::class, 'store']);
});

Route::middleware(['auth', 'tenant'])->group(function () {
    Route::post('logout', [AuthenticatedSessionController::class, 'destroy'])->name('logout');
    Route::get('dashboard', DashboardController::class)->name('dashboard');

    Route::get('customers', [CustomerController::class, 'index'])->name('customers.index');
    Route::post('customers', [CustomerController::class, 'store'])->name('customers.store');
    Route::get('customers/{customer}', [CustomerController::class, 'show'])->name('customers.show');
    Route::patch('customers/{customer}', [CustomerController::class, 'update'])->name('customers.update');
    Route::delete('customers/{customer}', [CustomerController::class, 'destroy'])->name('customers.destroy');

    Route::get('products', [ProductController::class, 'index'])->name('products.index');
    Route::post('products', [ProductController::class, 'store'])->name('products.store');
    Route::patch('products/{product}', [ProductController::class, 'update'])->name('products.update');
    Route::delete('products/{product}', [ProductController::class, 'destroy'])->name('products.destroy');

    Route::get('plans', [PlanController::class, 'index'])->name('plans.index');
    Route::post('plans', [PlanController::class, 'store'])->name('plans.store');
    Route::patch('plans/{plan}', [PlanController::class, 'update'])->name('plans.update');
    Route::delete('plans/{plan}', [PlanController::class, 'destroy'])->name('plans.destroy');

    Route::get('subscriptions', [SubscriptionController::class, 'index'])->name('subscriptions.index');
    Route::get('invoices', [InvoiceController::class, 'index'])->name('invoices.index');
    Route::post('invoices', [InvoiceController::class, 'store'])->name('invoices.store');
    Route::post('subscriptions/{subscription}/invoices', [InvoiceController::class, 'storeFromSubscription'])
        ->name('invoices.from-subscription');
    Route::get('invoices/{invoice}/document', [InvoiceController::class, 'document'])->name('invoices.document');
    Route::get('invoices/{invoice}/download', [InvoiceController::class, 'download'])->name('invoices.download');
    Route::get('invoices/{invoice}', [InvoiceController::class, 'show'])->name('invoices.show');
    Route::patch('invoices/{invoice}', [InvoiceController::class, 'update'])->name('invoices.update');
    Route::delete('invoices/{invoice}', [InvoiceController::class, 'destroy'])->name('invoices.destroy');

    Route::get('invoice-items', [InvoiceItemController::class, 'index'])->name('invoice-items.index');
    Route::post('invoice-items', [InvoiceItemController::class, 'store'])->name('invoice-items.store');
    Route::get('invoice-items/{invoiceItem}', [InvoiceItemController::class, 'show'])->name('invoice-items.show');
    Route::patch('invoice-items/{invoiceItem}', [InvoiceItemController::class, 'update'])->name('invoice-items.update');
    Route::delete('invoice-items/{invoiceItem}', [InvoiceItemController::class, 'destroy'])->name('invoice-items.destroy');

    Route::get('payments', [PaymentController::class, 'index'])->name('payments.index');
    Route::post('payments', [PaymentController::class, 'store'])->name('payments.store');
    Route::get('payments/{payment}', [PaymentController::class, 'show'])->name('payments.show');
    Route::patch('payments/{payment}', [PaymentController::class, 'update'])->name('payments.update');
    Route::delete('payments/{payment}', [PaymentController::class, 'destroy'])->name('payments.destroy');
    Route::get('team', TeamController::class)->name('team.index');
    Route::get('audit', AuditTrailController::class)->name('audit.index');
    Route::get('system-configuration', [SystemConfigurationController::class, 'index'])->name('system-configuration.index');
    Route::patch('system-configuration', [SystemConfigurationController::class, 'update'])->name('system-configuration.update');

    Route::get('users', [UserController::class, 'index'])->name('users.index');
    Route::get('users/{user}', [UserController::class, 'show'])->name('users.show');
    Route::post('users', [UserController::class, 'store'])->name('users.store');
    Route::patch('users/{user}', [UserController::class, 'update'])->name('users.update');
    Route::delete('users/{user}', [UserController::class, 'destroy'])->name('users.destroy');

    Route::get('billing-intervals', BillingIntervalController::class)->name('billing-intervals.index');
    Route::post('billing-interval-configs', [BillingIntervalConfigController::class, 'store'])->name('billing-interval-configs');
    Route::patch('billing-interval-configs/{billingIntervalConfig}', [BillingIntervalConfigController::class, 'update'])
        ->name('billing-interval-configs.update');
    Route::delete('billing-interval-configs/{billingIntervalConfig}', [BillingIntervalConfigController::class, 'destroy'])
        ->name('billing-interval-configs.destroy');

    Route::post('ecocash/initiate', [EcoCashController::class, 'initiate'])->name('ecocash.initiate');
    Route::get('ecocash/status/{referenceCode}', [EcoCashController::class, 'status'])->name('ecocash.status');

    Route::post('zimswitch/checkout', [ZimswitchController::class, 'prepare'])->name('zimswitch.checkout');
    Route::get('zimswitch/checkout/{checkoutId}/status', [ZimswitchController::class, 'status'])->name('zimswitch.checkout.status');

    Route::get('exchange-rates', [ExchangeRateController::class, 'index'])->name('exchange-rates.index');
    Route::post('exchange-rates', [ExchangeRateController::class, 'store'])->name('exchange-rates.store');
    Route::delete('exchange-rates/{exchangeRate}', [ExchangeRateController::class, 'destroy'])->name('exchange-rates.destroy');

    Route::get('api-keys', [ApiKeyController::class, 'index'])->name('api-keys.index');
    Route::post('api-keys', [ApiKeyController::class, 'store'])->name('api-keys.store');
    Route::delete('api-keys/{id}', [ApiKeyController::class, 'destroy'])->name('api-keys.destroy');

    Route::prefix('reports')->name('reports.')->group(function (): void {
        Route::get('revenue', RevenueReportController::class)->name('revenue');
        Route::get('customers', CustomerReportController::class)->name('customers');
        Route::get('subscriptions', SubscriptionReportController::class)->name('subscriptions');
        Route::get('invoices', InvoiceReportController::class)->name('invoices');
    });
});
