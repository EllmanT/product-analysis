<?php

declare(strict_types=1);

namespace App\Http\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;
use Spatie\LaravelData\Data;

final class ApiResponse
{
    /**
     * @param  array<string, mixed>|null  $errors
     */
    public static function error(string $message, int $status = 422, ?array $errors = null): JsonResponse
    {
        $payload = ['message' => $message];
        if ($errors !== null && $errors !== []) {
            $payload['errors'] = $errors;
        }

        return response()->json($payload, $status);
    }

    public static function ok(mixed $data, int $status = 200): JsonResponse
    {
        return response()->json(['data' => self::normalize($data)], $status);
    }

    public static function created(mixed $data): JsonResponse
    {
        return self::ok($data, 201);
    }

    public static function noContent(): JsonResponse
    {
        return response()->json(null, 204);
    }

    private static function normalize(mixed $data): mixed
    {
        if ($data instanceof Data) {
            return $data->toArray();
        }

        if ($data instanceof Collection) {
            return $data->map(fn (mixed $item): mixed => $item instanceof Data ? $item->toArray() : $item)->values()->all();
        }

        return $data;
    }
}
