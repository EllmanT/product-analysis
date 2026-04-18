<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Audit;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;

final class AuditService
{
    public function paginatedForTeam(Request $request, int $teamId): LengthAwarePaginator
    {
        $q = trim((string) $request->query('q', ''));
        $perPage = max(5, min(100, (int) $request->query('per_page', 10)));

        $query = Audit::query()
            ->forTeam($teamId)
            ->with('user')
            ->orderByDesc('id');

        if ($q !== '') {
            $needle = mb_strtolower($q);
            $like = '%'.$needle.'%';
            $query->where(function ($qb) use ($like): void {
                $qb->whereRaw('LOWER(event) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(COALESCE(auditable_type, \'\')) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(COALESCE(ip_address, \'\')) LIKE ?', [$like])
                    ->orWhereHas('user', function ($u) use ($like): void {
                        $u->whereRaw('LOWER(name) LIKE ?', [$like])
                            ->orWhereRaw('LOWER(email) LIKE ?', [$like]);
                    });
            });
        }

        return $query
            ->paginate($perPage)
            ->withQueryString()
            ->through(fn (Audit $a): array => [
                'id' => $a->id,
                'event' => $a->event,
                'auditable_type' => $a->auditable_type !== null ? class_basename($a->auditable_type) : '',
                'auditable_id' => $a->auditable_id,
                'user_name' => $a->user?->name,
                'user_email' => $a->user?->email,
                'old_values' => $a->old_values,
                'new_values' => $a->new_values,
                'ip_address' => $a->ip_address,
                'created_at' => $a->created_at?->toIso8601String(),
            ]);
    }
}
