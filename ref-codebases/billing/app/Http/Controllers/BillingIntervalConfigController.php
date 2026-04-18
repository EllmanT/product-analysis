<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\BillingIntervalConfig;
use App\Services\BillingIntervalConfigService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class BillingIntervalConfigController extends Controller
{
    public function __construct(
        private readonly BillingIntervalConfigService $service,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'label' => ['required', 'string', 'max:50'],
            'value' => ['required', 'string', 'max:50'],
            'is_recurring' => ['required', 'boolean'],
            'interval_count' => ['nullable', 'integer', 'min:1'],
            'interval_unit' => ['nullable', 'string', 'in:day,week,month,year'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ]);

        $teamId = (int) ($request->attributes->get('tenant_id') ?? auth()->user()?->team_id);
        $created = $this->service->create($teamId, $data);

        return response()->json($this->toRow($created), 201);
    }

    public function update(Request $request, BillingIntervalConfig $billingIntervalConfig): JsonResponse
    {
        $data = $request->validate([
            'label' => ['sometimes', 'string', 'max:50'],
            'is_recurring' => ['sometimes', 'boolean'],
            'interval_count' => ['nullable', 'integer', 'min:1'],
            'interval_unit' => ['nullable', 'string', 'in:day,week,month,year'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ]);

        $updated = $this->service->update($billingIntervalConfig, $data);

        return response()->json($this->toRow($updated));
    }

    public function destroy(BillingIntervalConfig $billingIntervalConfig): JsonResponse
    {
        try {
            $this->service->deleteOrFail($billingIntervalConfig);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Billing interval deleted.']);
    }

    /**
     * @return array<string, int|string|bool|null>
     */
    private function toRow(BillingIntervalConfig $c): array
    {
        return [
            'id' => $c->id,
            'label' => $c->label,
            'value' => $c->value,
            'is_recurring' => (bool) $c->is_recurring,
            'interval_count' => $c->interval_count,
            'interval_unit' => $c->interval_unit,
            'sort_order' => $c->sort_order,
        ];
    }
}
