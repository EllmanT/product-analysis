<?php

namespace App\Http\Requests;

use App\Data\ProductData;
use App\Http\Requests\Concerns\ValidatesHsCodeForTenant;

class UpdateProductRequest extends BaseRequest
{
    use ValidatesHsCodeForTenant;

    public function rules(): array
    {
        return ProductData::validationRulesForUpdate();
    }
}
