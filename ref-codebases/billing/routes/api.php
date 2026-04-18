<?php

use App\Http\Controllers\Api\CheckoutSessionController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\PlanController as ApiPlanController;
use App\Http\Controllers\Api\ProductController as ApiProductController;
use App\Http\Controllers\Api\SubscriptionController as ApiSubscriptionController;
use App\Http\Controllers\EcoCashController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

/** EcoCash server-to-server payment notification — public, no API-key auth needed. */
Route::post('ecocash/notify', [EcoCashController::class, 'notify']);

Route::middleware(['auth.api', 'throttle:billing-api'])->name('api.')->group(function (): void {
    Route::post('checkout-sessions', [CheckoutSessionController::class, 'store'])->name('checkout-sessions.store');
    Route::get('checkout-sessions/{checkoutSession:public_id}', [CheckoutSessionController::class, 'show'])->name('checkout-sessions.show');

    Route::get('plans', [ApiPlanController::class, 'index'])->name('plans.index');
    Route::get('plans/{plan}', [ApiPlanController::class, 'show'])->name('plans.show');
    Route::get('products', [ApiProductController::class, 'index'])->name('products.index');
    Route::get('products/{product}', [ApiProductController::class, 'show'])->name('products.show');

    Route::get('customers/{customer}/subscriptions', [ApiSubscriptionController::class, 'byCustomer'])
        ->name('customers.subscriptions');

    Route::post('subscriptions/{subscription}/activate', [ApiSubscriptionController::class, 'activate'])
        ->name('subscriptions.activate');
    Route::post('subscriptions/{subscription}/cancel', [ApiSubscriptionController::class, 'cancel'])
        ->name('subscriptions.cancel');
    Route::post('subscriptions/{subscription}/renew', [ApiSubscriptionController::class, 'renew'])
        ->name('subscriptions.renew');
    Route::post('subscriptions/{subscription}/transition-status', [ApiSubscriptionController::class, 'transitionStatus'])
        ->name('subscriptions.transition-status');

    Route::apiResource('subscriptions', ApiSubscriptionController::class);
});
