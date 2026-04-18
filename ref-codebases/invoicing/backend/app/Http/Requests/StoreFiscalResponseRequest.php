<?php

namespace App\Http\Requests;

use App\Data\FiscalResponseData;

class StoreFiscalResponseRequest extends BaseRequest
{
    public function rules(): array
    {
        return FiscalResponseData::validationRules();
    }
}
