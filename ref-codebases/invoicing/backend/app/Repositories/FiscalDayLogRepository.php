<?php

namespace App\Repositories;

use App\Models\FiscalDayLog;
use App\Repositories\Interfaces\FiscalDayLogRepositoryInterface;

class FiscalDayLogRepository extends BaseRepository implements FiscalDayLogRepositoryInterface
{
    public function __construct()
    {
        parent::__construct(FiscalDayLog::class);
    }
}
