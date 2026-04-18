<?php

namespace App\Http\Requests;

use App\Data\HSCodeData;

class StoreHsCodeRequest extends BaseRequest
{
    public function rules(): array
    {
        return HSCodeData::validationRules();
    }
}
