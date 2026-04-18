<?php

namespace App\Repositories;

use App\Models\Buyer;
use App\Repositories\Interfaces\BuyerRepositoryInterface;

class BuyerRepository extends BaseRepository implements BuyerRepositoryInterface
{
    public function __construct()
    {
        parent::__construct(Buyer::class);
    }
}
