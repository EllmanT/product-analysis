<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Validation\Rule;

final class ApiValidationRules
{
    /**
     * @return array<int, mixed>
     */
    public static function customerId(bool $required = true): array
    {
        $rules = [
            'integer',
            Rule::exists('customers', 'id')->where(function ($query): void {
                $teamId = auth()->user()?->team_id;
                if ($teamId !== null && $teamId !== '') {
                    $query->where('team_id', $teamId);
                }
            }),
        ];

        if ($required) {
            array_unshift($rules, 'required');
        }

        return $rules;
    }

    /**
     * @return array<int, mixed>
     */
    public static function planId(bool $required = true): array
    {
        $rules = [
            'integer',
            Rule::exists('plans', 'id')->where(function ($query): void {
                $teamId = auth()->user()?->team_id;
                if ($teamId !== null && $teamId !== '') {
                    $query->where('team_id', $teamId);
                }
            }),
        ];

        if ($required) {
            array_unshift($rules, 'required');
        }

        return $rules;
    }

    /**
     * @return array<int, mixed>
     */
    public static function productId(bool $required = true): array
    {
        $rules = [
            'integer',
            Rule::exists('products', 'id')->where(function ($query): void {
                $teamId = auth()->user()?->team_id;
                if ($teamId !== null && $teamId !== '') {
                    $query->where('team_id', $teamId);
                }
            }),
        ];

        if ($required) {
            array_unshift($rules, 'required');
        }

        return $rules;
    }

    /**
     * @return array<int, mixed>
     */
    public static function invoiceId(bool $required = true): array
    {
        $rules = [
            'integer',
            Rule::exists('invoices', 'id')->where(function ($query): void {
                $teamId = auth()->user()?->team_id;
                if ($teamId !== null && $teamId !== '') {
                    $query->where('team_id', $teamId);
                }
            }),
        ];

        if ($required) {
            array_unshift($rules, 'required');
        }

        return $rules;
    }

    /**
     * @return array<int, mixed>
     */
    public static function subscriptionId(bool $required = false): array
    {
        $exists = Rule::exists('subscriptions', 'id')->where(function ($query): void {
            $teamId = auth()->user()?->team_id;
            if ($teamId !== null && $teamId !== '') {
                $query->where('team_id', $teamId);
            }
        });

        if ($required) {
            return ['required', 'integer', $exists];
        }

        return ['nullable', 'integer', $exists];
    }
}
