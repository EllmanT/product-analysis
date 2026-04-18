<?php

namespace App\Http\Requests;

use App\Data\FiscalDayLogData;

class StoreFiscalDayLogRequest extends BaseRequest
{
    public function rules(): array
    {
        return FiscalDayLogData::validationRules();
    }
}
