<?php

namespace App\Services;

use App\Models\Company;
use App\Models\UnitOfMeasure;

class UnitOfMeasureService
{
    /**
     * Ensure a unit row exists for this company when a product uses a unit name.
     */
    public function ensureUnitExists(?Company $company, ?string $name): void
    {
        if ($company === null) {
            return;
        }

        $trimmed = is_string($name) ? trim($name) : '';
        if ($trimmed === '') {
            return;
        }

        UnitOfMeasure::query()->firstOrCreate(
            [
                'company_id' => $company->id,
                'name' => $trimmed,
            ],
            ['name' => $trimmed]
        );
    }
}
