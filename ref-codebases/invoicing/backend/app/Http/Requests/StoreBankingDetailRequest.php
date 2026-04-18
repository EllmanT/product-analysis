<?php

namespace App\Http\Requests;

use App\Data\BankingDetailData;

class StoreBankingDetailRequest extends BaseRequest
{
    public function rules(): array
    {
        return BankingDetailData::validationRules();
    }
}
