<?php

namespace App\Http\Requests;

use App\Data\InvoiceData;

class StoreInvoiceRequest extends BaseRequest
{
    public function rules(): array
    {
        return InvoiceData::validationRules();
    }
}
