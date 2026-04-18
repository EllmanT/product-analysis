<?php

namespace App\Http\Requests;

use App\Data\CompanyData;

class StoreCompanyRequest extends BaseRequest
{
    public function rules(): array
    {
        return CompanyData::validationRules();
    }
}
