<?php

namespace App\Http\Requests;

use App\Data\CompanyDeviceData;

class UpdateCompanyDeviceRequest extends BaseRequest
{
    public function rules(): array
    {
        return CompanyDeviceData::validationRulesForUpdate();
    }
}
