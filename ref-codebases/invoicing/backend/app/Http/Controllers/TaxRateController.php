<?php

namespace App\Http\Controllers;

use App\Models\TaxRate;
use Illuminate\Http\JsonResponse;

class TaxRateController extends Controller
{
    /**
     * Reference tax codes (read-only; seeded).
     */
    public function index(): JsonResponse
    {
        $rows = TaxRate::query()->orderBy('sort_order')->orderBy('code')->get();

        return response()->json($rows);
    }
}
