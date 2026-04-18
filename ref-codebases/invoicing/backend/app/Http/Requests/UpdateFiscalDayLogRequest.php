<?php

namespace App\Http\Requests;

use App\Data\FiscalDayLogData;

class UpdateFiscalDayLogRequest extends BaseRequest
{
    public function rules(): array
    {
        return FiscalDayLogData::validationRulesForUpdate();
    }
}
