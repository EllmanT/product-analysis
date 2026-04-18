<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolves the current tenant from the authenticated user's team_id and exposes it on the request.
 * Aborts if the user has no team (prevents unscoped queries when global scope would otherwise fail open).
 */
final class EnsureUserHasTeam
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user === null) {
            return $next($request);
        }

        $teamId = $user->team_id;
        if ($teamId === null || $teamId === '') {
            abort(403, 'Your account is not assigned to a team.');
        }

        $request->attributes->set('tenant_id', (int) $teamId);

        return $next($request);
    }
}
