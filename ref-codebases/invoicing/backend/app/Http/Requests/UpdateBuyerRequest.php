<?php

namespace App\Http\Requests;

use App\Data\BuyerData;

class UpdateBuyerRequest extends BaseRequest
{
    public function rules(): array
    {
        return BuyerData::validationRulesForUpdate();
    }
}
