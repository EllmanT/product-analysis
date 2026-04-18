<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Concerns;

use Illuminate\Http\Request;

trait ResolvesAdminTableQuery
{
    /**
     * @return array{per_page: int, q: string}
     */
    protected function tableParams(Request $request): array
    {
        $perPage = (int) $request->integer('per_page', 10);
        $perPage = min(100, max(5, $perPage));
        $q = trim((string) $request->string('q', ''));

        return ['per_page' => $perPage, 'q' => $q];
    }
}
