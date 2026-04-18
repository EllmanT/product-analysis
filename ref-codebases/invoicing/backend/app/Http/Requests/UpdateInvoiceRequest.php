<?php

namespace App\Http\Requests;

use App\Data\InvoiceData;

class UpdateInvoiceRequest extends BaseRequest
{
    public function rules(): array
    {
        return InvoiceData::validationRulesForUpdate();
    }
}
