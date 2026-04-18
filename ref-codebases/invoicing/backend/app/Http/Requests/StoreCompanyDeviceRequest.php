<?php

namespace App\Http\Requests;

use App\Data\CompanyDeviceData;

class StoreCompanyDeviceRequest extends BaseRequest
{
    public function rules(): array
    {
        return CompanyDeviceData::validationRules();
    }
}
