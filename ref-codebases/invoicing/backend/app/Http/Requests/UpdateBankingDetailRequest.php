<?php

namespace App\Http\Requests;

use App\Data\BankingDetailData;

class UpdateBankingDetailRequest extends BaseRequest
{
    public function rules(): array
    {
        return BankingDetailData::validationRulesForUpdate();
    }
}
