<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\UserActivationCodeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class UserActivationCodeController extends Controller
{
    public function show(Request $request, UserActivationCodeService $service): JsonResponse
    {
        $user = $request->user();
        if ($user === null) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        try {
            return response()->json($service->statusForUser($user));
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        }
    }

    public function regenerate(Request $request, UserActivationCodeService $service): JsonResponse
    {
        $user = $request->user();
        if ($user === null) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        try {
            $plain = $service->issueForUser($user);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        }

        $normalized = $service->normalize($plain);

        return response()->json([
            'activation_code' => $plain,
            'hint' => substr($normalized, -2),
            'message' => 'Save this code in a safe place. It will not be shown again.',
        ]);
    }
}
