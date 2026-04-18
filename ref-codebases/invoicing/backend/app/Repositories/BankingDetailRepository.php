<?php

namespace App\Repositories;

use App\Models\BankingDetail;
use App\Repositories\Interfaces\BankingDetailRepositoryInterface;

class BankingDetailRepository extends BaseRepository implements BankingDetailRepositoryInterface
{
    public function __construct()
    {
        parent::__construct(BankingDetail::class);
    }
}
