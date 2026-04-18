<?php

namespace App\Http\Requests;

use App\Data\InvoiceLineData;

class UpdateInvoiceLineRequest extends BaseRequest
{
    public function rules(): array
    {
        return InvoiceLineData::validationRulesForUpdate();
    }
}
