<?php

namespace App\Repositories;

use App\Models\FiscalResponse;
use App\Repositories\Interfaces\FiscalResponseRepositoryInterface;

class FiscalResponseRepository extends BaseRepository implements FiscalResponseRepositoryInterface
{
    public function __construct()
    {
        parent::__construct(FiscalResponse::class);
    }
}
