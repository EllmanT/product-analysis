<?php

namespace App\Http\Requests;

use App\Data\InvoiceLineData;

class StoreInvoiceLineRequest extends BaseRequest
{
    public function rules(): array
    {
        return InvoiceLineData::validationRules();
    }
}
