<?php

namespace App\Http\Requests;

use App\Data\UserData;

class UpdateUserRequest extends BaseRequest
{
    public function rules(): array
    {
        return UserData::validationRulesForUpdate();
    }
}
