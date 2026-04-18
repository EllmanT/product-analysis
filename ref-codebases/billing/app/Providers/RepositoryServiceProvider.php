<?php

declare(strict_types=1);

namespace App\Providers;

use App\DAO\CustomerDao;
use App\DAO\ExchangeRateDao;
use App\DAO\Interfaces\CustomerDaoInterface;
use App\DAO\Interfaces\ExchangeRateDaoInterface;
use App\DAO\Interfaces\InvoiceDaoInterface;
use App\DAO\Interfaces\InvoiceItemDaoInterface;
use App\DAO\Interfaces\PaymentDaoInterface;
use App\DAO\Interfaces\PlanDaoInterface;
use App\DAO\Interfaces\ProductDaoInterface;
use App\DAO\Interfaces\SubscriptionDaoInterface;
use App\DAO\InvoiceDao;
use App\DAO\InvoiceItemDao;
use App\DAO\PaymentDao;
use App\DAO\PlanDao;
use App\DAO\ProductDao;
use App\DAO\SubscriptionDao;
use App\Repositories\CustomerRepository;
use App\Repositories\ExchangeRateRepository;
use App\Repositories\Interfaces\CustomerRepositoryInterface;
use App\Repositories\Interfaces\ExchangeRateRepositoryInterface;
use App\Repositories\Interfaces\InvoiceItemRepositoryInterface;
use App\Repositories\Interfaces\InvoiceRepositoryInterface;
use App\Repositories\Interfaces\PaymentRepositoryInterface;
use App\Repositories\Interfaces\PlanRepositoryInterface;
use App\Repositories\Interfaces\ProductRepositoryInterface;
use App\Repositories\Interfaces\SubscriptionRepositoryInterface;
use App\Repositories\InvoiceItemRepository;
use App\Repositories\InvoiceRepository;
use App\Repositories\PaymentRepository;
use App\Repositories\PlanRepository;
use App\Repositories\ProductRepository;
use App\Repositories\SubscriptionRepository;
use Illuminate\Support\ServiceProvider;

class RepositoryServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(CustomerDaoInterface::class, CustomerDao::class);
        $this->app->bind(CustomerRepositoryInterface::class, CustomerRepository::class);

        $this->app->bind(ExchangeRateDaoInterface::class, ExchangeRateDao::class);
        $this->app->bind(ExchangeRateRepositoryInterface::class, ExchangeRateRepository::class);

        $this->app->bind(ProductDaoInterface::class, ProductDao::class);
        $this->app->bind(ProductRepositoryInterface::class, ProductRepository::class);

        $this->app->bind(PlanDaoInterface::class, PlanDao::class);
        $this->app->bind(PlanRepositoryInterface::class, PlanRepository::class);

        $this->app->bind(SubscriptionDaoInterface::class, SubscriptionDao::class);
        $this->app->bind(SubscriptionRepositoryInterface::class, SubscriptionRepository::class);

        $this->app->bind(InvoiceDaoInterface::class, InvoiceDao::class);
        $this->app->bind(InvoiceRepositoryInterface::class, InvoiceRepository::class);

        $this->app->bind(InvoiceItemDaoInterface::class, InvoiceItemDao::class);
        $this->app->bind(InvoiceItemRepositoryInterface::class, InvoiceItemRepository::class);

        $this->app->bind(PaymentDaoInterface::class, PaymentDao::class);
        $this->app->bind(PaymentRepositoryInterface::class, PaymentRepository::class);
    }

    public function boot(): void
    {
        //
    }
}
