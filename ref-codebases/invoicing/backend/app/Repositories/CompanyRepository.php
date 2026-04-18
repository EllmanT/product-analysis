<?php

namespace App\Repositories;

use App\Models\Company;
use App\Repositories\Interfaces\CompanyRepositoryInterface;

class CompanyRepository extends BaseRepository implements CompanyRepositoryInterface
{
    public function __construct()
    {
        parent::__construct(Company::class);
    }
}
