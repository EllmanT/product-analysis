<?php

namespace App\Http\Requests;

use App\Data\UserData;

class StoreUserRequest extends BaseRequest
{
    public function rules(): array
    {
        return UserData::validationRules();
    }
}
