<?php

namespace App\Http\Requests;

use App\Data\InvoiceTaxData;

class UpdateInvoiceTaxRequest extends BaseRequest
{
    public function rules(): array
    {
        return InvoiceTaxData::validationRulesForUpdate();
    }
}
