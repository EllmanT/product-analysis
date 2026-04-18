<?php

namespace App\Http\Requests;

use App\Data\ProductData;
use App\Http\Requests\Concerns\ValidatesHsCodeForTenant;

class StoreProductRequest extends BaseRequest
{
    use ValidatesHsCodeForTenant;

    public function rules(): array
    {
        return ProductData::validationRules();
    }
}
