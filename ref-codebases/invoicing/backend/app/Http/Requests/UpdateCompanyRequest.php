<?php

namespace App\Http\Requests;

use App\Data\CompanyData;

class UpdateCompanyRequest extends BaseRequest
{
    public function rules(): array
    {
        return CompanyData::validationRulesForUpdate();
    }
}
