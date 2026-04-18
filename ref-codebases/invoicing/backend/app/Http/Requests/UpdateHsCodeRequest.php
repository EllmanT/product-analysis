<?php

namespace App\Http\Requests;

use App\Data\HSCodeData;

class UpdateHsCodeRequest extends BaseRequest
{
    public function rules(): array
    {
        return HSCodeData::validationRulesForUpdate();
    }
}
