<?php

namespace App\Http\Requests;

use App\Data\InvoiceTaxData;

class StoreInvoiceTaxRequest extends BaseRequest
{
    public function rules(): array
    {
        return InvoiceTaxData::validationRules();
    }
}
