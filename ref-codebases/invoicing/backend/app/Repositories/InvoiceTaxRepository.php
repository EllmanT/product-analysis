<?php

namespace App\Repositories;

use App\Models\InvoiceTax;
use App\Repositories\Interfaces\InvoiceTaxRepositoryInterface;

class InvoiceTaxRepository extends BaseRepository implements InvoiceTaxRepositoryInterface
{
    public function __construct()
    {
        parent::__construct(InvoiceTax::class);
    }
}
