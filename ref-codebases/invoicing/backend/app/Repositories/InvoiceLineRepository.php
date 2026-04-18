<?php

namespace App\Repositories;

use App\Models\InvoiceLine;
use App\Repositories\Interfaces\InvoiceLineRepositoryInterface;

class InvoiceLineRepository extends BaseRepository implements InvoiceLineRepositoryInterface
{
    public function __construct()
    {
        parent::__construct(InvoiceLine::class);
    }
}
