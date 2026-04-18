<?php

namespace App\Http\Requests;

use Illuminate\Validation\Rule;

class UpdateUnitOfMeasureRequest extends BaseRequest
{
    public function rules(): array
    {
        $companyId = auth()->user()?->company_id;

        if ($companyId === null) {
            return [
                'name' => ['sometimes', 'required', 'string', 'max:100'],
            ];
        }

        return [
            'name' => [
                'sometimes',
                'required',
                'string',
                'max:100',
                Rule::unique('units_of_measure', 'name')
                    ->where(fn ($q) => $q->where('company_id', $companyId))
                    ->ignore($this->route('units_of_measure'), 'id'),
            ],
        ];
    }
}
