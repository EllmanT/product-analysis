<?php

namespace App\Http\Requests;

use App\Data\BuyerData;

class StoreBuyerRequest extends BaseRequest
{
    public function rules(): array
    {
        return BuyerData::validationRules();
    }
}
