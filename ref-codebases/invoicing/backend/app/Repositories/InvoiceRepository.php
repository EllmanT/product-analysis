<?php

namespace App\Repositories;

use App\Models\Invoice;
use App\Repositories\Interfaces\InvoiceRepositoryInterface;

class InvoiceRepository extends BaseRepository implements InvoiceRepositoryInterface
{
    public function __construct()
    {
        parent::__construct(Invoice::class);
    }
}
