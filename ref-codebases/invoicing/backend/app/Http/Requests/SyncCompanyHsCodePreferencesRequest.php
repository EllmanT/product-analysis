<?php

namespace App\Http\Requests;

class SyncCompanyHsCodePreferencesRequest extends BaseRequest
{
    public function rules(): array
    {
        return [
            'items' => ['required', 'array', 'max:1000'],
            'items.*.hs_code_id' => ['required', 'uuid', 'exists:hs_codes,id'],
            'items.*.is_enabled' => ['required', 'boolean'],
        ];
    }
}
