<?php

namespace App\Http\Requests;

class UpdateFiscalDayScheduleRequest extends BaseRequest
{
    public function rules(): array
    {
        return [
            'is_enabled' => ['sometimes', 'boolean'],
            'auto_close_enabled' => ['sometimes', 'boolean'],
            'auto_open_enabled' => ['sometimes', 'boolean'],
            'close_time' => ['nullable', 'string', 'regex:/^\d{2}:\d{2}$/'],
            'open_time' => ['nullable', 'string', 'regex:/^\d{2}:\d{2}$/'],
            'close_weekdays' => ['nullable', 'array'],
            'close_weekdays.*' => ['integer', 'min:1', 'max:7'],
            'open_weekdays' => ['nullable', 'array'],
            'open_weekdays.*' => ['integer', 'min:1', 'max:7'],
            'timezone' => ['nullable', 'string', 'max:64'],
        ];
    }
}
