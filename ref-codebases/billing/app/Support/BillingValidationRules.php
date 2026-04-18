<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Strict, reusable validation fragments for billing amounts and identifiers.
 */
final class BillingValidationRules
{
    /**
     * Non-negative decimal string with up to two fractional digits (e.g. 12, 12.3, 12.34).
     *
     * @return list<string>
     */
    public static function moneyAmount(bool $required = true): array
    {
        $rules = ['string', 'regex:/^(0|[1-9]\d*)(\.\d{1,2})?$/'];

        if ($required) {
            array_unshift($rules, 'required');
        } else {
            array_unshift($rules, 'sometimes');
        }

        return $rules;
    }

    /**
     * Three-letter currency code (letters only; normalized to uppercase in DTOs where needed).
     *
     * @return list<string>
     */
    public static function currencyCode(bool $required = true): array
    {
        $rules = ['string', 'size:3', 'alpha'];

        if ($required) {
            array_unshift($rules, 'required');
        } else {
            array_unshift($rules, 'sometimes');
        }

        return $rules;
    }

    /**
     * @return list<string>
     */
    public static function optionalMoneyAmount(): array
    {
        return ['sometimes', 'string', 'regex:/^(0|[1-9]\d*)(\.\d{1,2})?$/'];
    }

    /**
     * Money amount strictly greater than zero (e.g. payment capture).
     *
     * @return list<string>
     */
    public static function positiveMoneyAmount(): array
    {
        return ['required', 'string', 'regex:/^(0|[1-9]\d*)(\.\d{1,2})?$/', 'numeric', 'min:0.01'];
    }
}
