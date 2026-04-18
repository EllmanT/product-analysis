<?php

namespace App\Repositories;

use App\Models\HsCode;
use App\Repositories\Interfaces\HsCodeRepositoryInterface;

class HsCodeRepository extends BaseRepository implements HsCodeRepositoryInterface
{
    public function __construct()
    {
        parent::__construct(HsCode::class);
    }
}
