<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use OwenIt\Auditing\Auditable;

trait AuditableTeamScoped
{
    use Auditable;

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function transformAudit(array $data): array
    {
        $data['team_id'] = $this->team_id ?? auth()->user()?->team_id;

        return $data;
    }
}
