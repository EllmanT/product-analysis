<?php

namespace App\Repositories;

use App\Models\CompanyDevice;
use App\Repositories\Interfaces\CompanyDeviceRepositoryInterface;

class CompanyDeviceRepository extends BaseRepository implements CompanyDeviceRepositoryInterface
{
    public function __construct()
    {
        parent::__construct(CompanyDevice::class);
    }
}
