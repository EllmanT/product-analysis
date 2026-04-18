<?php

namespace App\Http\Requests;

use App\Data\FiscalResponseData;

class UpdateFiscalResponseRequest extends BaseRequest
{
    public function rules(): array
    {
        return FiscalResponseData::validationRulesForUpdate();
    }
}
