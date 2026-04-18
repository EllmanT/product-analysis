<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class RegisterNonFiscalizedCompanyRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true; // Public endpoint, no auth required
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // Company details
            'company_name' => ['required', 'string', 'max:255'],
            'registration_number' => ['required', 'string', 'max:100', 'unique:non_fiscalized_companies,registration_number'],
            'tax_id' => ['nullable', 'string', 'max:50'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['required', 'string', 'max:50'],
            'physical_address' => ['nullable', 'string'],
            'city' => ['nullable', 'string', 'max:100'],
            'country' => ['required', 'string', 'max:100'],
            'postal_code' => ['nullable', 'string', 'max:20'],
            
            // Admin user details
            'admin_first_name' => ['required', 'string', 'max:100'],
            'admin_last_name' => ['required', 'string', 'max:100'],
            'admin_email' => ['required', 'email', 'max:255', 'unique:non_fiscalized_companies,admin_email'],
            'admin_phone' => ['required', 'string', 'max:50'],
            'admin_password' => ['required', 'confirmed', Password::min(8)
                ->mixedCase()
                ->numbers()
                ->symbols()
            ],
        ];
    }

    /**
     * Get custom messages for validator errors.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'company_name.required' => 'Company name is required',
            'registration_number.required' => 'Registration number is required',
            'registration_number.unique' => 'A company with this registration number already exists',
            'email.required' => 'Company email is required',
            'email.email' => 'Please provide a valid email address',
            'phone.required' => 'Company phone number is required',
            'country.required' => 'Country is required',
            'admin_first_name.required' => 'Administrator first name is required',
            'admin_last_name.required' => 'Administrator last name is required',
            'admin_email.required' => 'Administrator email is required',
            'admin_email.unique' => 'An administrator with this email already exists',
            'admin_phone.required' => 'Administrator phone number is required',
            'admin_password.required' => 'Password is required',
            'admin_password.confirmed' => 'Password confirmation does not match',
            'admin_password.min' => 'Password must be at least 8 characters',
        ];
    }
}
