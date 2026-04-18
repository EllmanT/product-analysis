<?php

declare(strict_types=1);

use App\Http\Controllers\Admin\Auth\AuthenticatedSessionController;
use App\Http\Controllers\Admin\BuyerController;
use App\Http\Controllers\Admin\CompanyController;
use App\Http\Controllers\Admin\CompanyDeviceController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\IntegrationSettingsController;
use App\Http\Controllers\Admin\InvoiceController;
use App\Http\Controllers\Admin\ProductController;
use App\Http\Controllers\Admin\SettingsController;
use App\Http\Controllers\Admin\UserActivationCodeController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\UserPasswordController;
use Illuminate\Support\Facades\Route;

Route::redirect('/admin', '/admin/dashboard');

Route::prefix('admin')->name('admin.')->group(function (): void {
    Route::middleware('guest')->group(function (): void {
        Route::get('login', [AuthenticatedSessionController::class, 'create'])->name('login');
        Route::post('login', [AuthenticatedSessionController::class, 'store'])
            ->middleware('throttle:20,1')
            ->name('login.store');
    });

    Route::middleware(['auth', 'super_admin'])->group(function (): void {
        Route::post('logout', [AuthenticatedSessionController::class, 'destroy'])->name('logout');

        Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');

        Route::get('companies', [CompanyController::class, 'index'])->name('companies.index');
        Route::get('companies/{company}', [CompanyController::class, 'show'])->name('companies.show');
        Route::get('companies/{company}/edit', [CompanyController::class, 'edit'])->name('companies.edit');
        Route::put('companies/{company}', [CompanyController::class, 'update'])->name('companies.update');
        Route::delete('companies/{company}', [CompanyController::class, 'destroy'])->name('companies.destroy');

        Route::get('devices', [CompanyDeviceController::class, 'index'])->name('devices.index');
        Route::get('devices/{device}', [CompanyDeviceController::class, 'show'])->name('devices.show');
        Route::post('devices/{device}/retry-activation', [CompanyDeviceController::class, 'retryActivation'])->name('devices.retry-activation');

        Route::get('users', [UserController::class, 'index'])->name('users.index');
        Route::get('users/create', [UserController::class, 'create'])->name('users.create');
        Route::post('users', [UserController::class, 'store'])->name('users.store');
        Route::get('users/{user}', [UserController::class, 'show'])->name('users.show');
        Route::get('users/{user}/edit', [UserController::class, 'edit'])->name('users.edit');
        Route::put('users/{user}', [UserController::class, 'update'])->name('users.update');
        Route::delete('users/{user}', [UserController::class, 'destroy'])->name('users.destroy');
        Route::post('users/{user}/activation-code', [UserActivationCodeController::class, 'store'])->name('users.activation-code.store');
        Route::put('users/{user}/password', [UserPasswordController::class, 'update'])->name('users.password.update');
        Route::get('invoices', [InvoiceController::class, 'index'])->name('invoices.index');
        Route::get('invoices/{invoice}', [InvoiceController::class, 'show'])->name('invoices.show');
        Route::get('products', [ProductController::class, 'index'])->name('products.index');
        Route::get('buyers', [BuyerController::class, 'index'])->name('buyers.index');

        Route::get('settings/application', [SettingsController::class, 'edit'])->name('settings.application');
        Route::put('settings/application', [SettingsController::class, 'update'])->name('settings.application.update');

        Route::get('settings/integration', [IntegrationSettingsController::class, 'edit'])->name('settings.integration');
        Route::put('settings/integration', [IntegrationSettingsController::class, 'update'])->name('settings.integration.update');
    });
});
