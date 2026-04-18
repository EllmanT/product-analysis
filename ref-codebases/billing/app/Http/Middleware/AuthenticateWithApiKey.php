<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\ApiKey;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates requests using the X-API-Key header.
 * Falls back to session auth when the header is absent.
 * Sets tenant_id on request attributes so HasTeamScope works without a session user.
 */
final class AuthenticateWithApiKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $rawKey = $this->extractKey($request);

        if ($rawKey !== null) {
            return $this->handleApiKey($request, $next, $rawKey);
        }

        // Fall back to session-authenticated user
        if (auth()->hasUser()) {
            $teamId = auth()->user()?->team_id;

            if ($teamId === null) {
                return response()->json(['error' => 'Account is not assigned to a team.'], 403);
            }

            $request->attributes->set('tenant_id', (int) $teamId);

            return $next($request);
        }

        return response()->json(['error' => 'Unauthenticated. Provide a valid X-API-Key header.'], 401);
    }

    private function handleApiKey(Request $request, Closure $next, string $rawKey): Response
    {
        if (strlen($rawKey) < 12 || ! str_starts_with($rawKey, 'axb_')) {
            return response()->json(['error' => 'Invalid API key format.'], 401);
        }

        $prefix = substr($rawKey, 0, 12);

        $candidates = ApiKey::withoutGlobalScope('team')
            ->where('key_prefix', $prefix)
            ->get();

        foreach ($candidates as $apiKey) {
            if (! $apiKey->verify($rawKey)) {
                continue;
            }

            if ($apiKey->isExpired()) {
                return response()->json(['error' => 'API key has expired.'], 401);
            }

            $request->attributes->set('tenant_id', (int) $apiKey->team_id);
            $request->attributes->set('api_key_id', $apiKey->id);
            // Read allowed products directly from pivot to avoid scope/relationship edge cases.
            $productIds = DB::table('api_key_products')
                ->where('api_key_id', $apiKey->id)
                ->pluck('product_id')
                ->map(fn ($id) => (int) $id)
                ->all();

            if ($productIds === []) {
                return response()->json([
                    'error' => 'API key is not scoped to any products. Regenerate the key and select at least one product.',
                ], 403);
            }

            $request->attributes->set('api_key_product_ids', $productIds);

            // Touch last_used_at after response to avoid blocking
            app()->terminating(function () use ($apiKey): void {
                $apiKey->updateQuietly(['last_used_at' => now()]);
            });

            return $next($request);
        }

        return response()->json(['error' => 'Invalid or revoked API key.'], 401);
    }

    private function extractKey(Request $request): ?string
    {
        $header = $request->header('X-API-Key');

        return (is_string($header) && $header !== '') ? $header : null;
    }
}
