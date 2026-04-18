<?php

declare(strict_types=1);

namespace App\Data\Concerns;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

trait FromValidatedRequest
{
    /**
     * @param  array<string, mixed>  $additional
     */
    public static function fromRequest(Request $request, array $additional = []): static
    {
        $payload = array_merge($request->all(), $additional);

        static::assertNoUnknownKeys($payload);

        return static::from(
            Validator::make($payload, static::rules())->validate()
        );
    }

    /**
     * Reject request bodies that include fields not declared in {@see rules()}.
     *
     * @param  array<string, mixed>  $payload
     */
    protected static function assertNoUnknownKeys(array $payload): void
    {
        $allowed = array_keys(static::rules());
        $present = array_keys($payload);
        $unknown = array_values(array_diff($present, $allowed));

        if ($unknown === []) {
            return;
        }

        $messages = [];
        foreach ($unknown as $key) {
            $messages[$key] = ["The {$key} field is not allowed."];
        }

        throw ValidationException::withMessages($messages);
    }
}
