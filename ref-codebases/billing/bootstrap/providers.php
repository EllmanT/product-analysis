<?php

use App\Providers\AppServiceProvider;
use App\Providers\EventServiceProvider;
use App\Providers\HorizonServiceProvider;
use App\Providers\RepositoryServiceProvider;

return [
    AppServiceProvider::class,
    EventServiceProvider::class,
    HorizonServiceProvider::class,
    RepositoryServiceProvider::class,
];
