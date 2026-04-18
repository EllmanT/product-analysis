<?php

declare(strict_types=1);

namespace App\Services;

use App\Data\Api\StorePlanData;
use App\Data\Api\UpdatePlanData;
use App\Data\PlanDto;
use App\Models\Plan;
use App\Repositories\Interfaces\PlanRepositoryInterface;
use App\Support\BillingCacheKeys;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Throwable;

final class PlanService
{
    public function __construct(
        private readonly PlanRepositoryInterface $plans,
        private readonly ExchangeRateService $fx,
    ) {}

    /**
     * Paginated plans for the Inertia index (bypasses full-list cache; applies FX like listPlans).
     *
     * @return array{items: array{data: array<int, array<string, mixed>>, current_page: int, last_page: int, per_page: int, total: int}, filters: array{q: string, per_page: int}}
     */
    public function paginatedForIndex(Request $request): array
    {
        $q = trim((string) $request->query('q', ''));
        $productId = $request->query('product_id');
        $perPage = max(5, min(100, (int) $request->query('per_page', 10)));

        $query = Plan::query()->with('product')->orderBy('name');
        if ($productId !== null && $productId !== '' && is_numeric($productId)) {
            $query->where('product_id', (int) $productId);
        }
        if ($q !== '') {
            $needle = mb_strtolower($q);
            $like = '%'.$needle.'%';
            $query->where(function ($qb) use ($like): void {
                $qb->whereRaw('LOWER(plans.name) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(COALESCE(plans.billing_interval, \'\')) LIKE ?', [$like])
                    ->orWhereHas('product', function ($p) use ($like): void {
                        $p->whereRaw('LOWER(products.name) LIKE ?', [$like]);
                    });
            });
        }

        $currentRates = $this->fx->currentRates();
        $p = $query->paginate($perPage)->withQueryString();
        $p->setCollection(
            $p->getCollection()->map(function (Plan $plan) use ($currentRates): array {
                $plan->loadMissing('product');

                return $this->withPrices(PlanDto::from($plan), $currentRates)->toArray();
            })
        );

        return [
            'items' => [
                'data' => $p->items(),
                'current_page' => $p->currentPage(),
                'last_page' => $p->lastPage(),
                'per_page' => $p->perPage(),
                'total' => $p->total(),
            ],
            'filters' => [
                'q' => $q,
                'per_page' => $perPage,
                'product_id' => ($productId !== null && $productId !== '') ? (int) $productId : null,
            ],
        ];
    }

    /**
     * @return Collection<int, PlanDto>
     */
    public function listPlans(): Collection
    {
        $currentRates = $this->fx->currentRates();
        $allowedProductIds = $this->apiKeyAllowedProductIds();
        if ($allowedProductIds !== null) {
            if ($allowedProductIds === []) {
                return collect();
            }

            return Plan::query()
                ->with('product')
                ->whereIn('product_id', $allowedProductIds)
                ->orderBy('name')
                ->get()
                ->map(fn (Plan $plan): PlanDto => $this->withPrices(PlanDto::from($plan), $currentRates));
        }

        $teamId = $this->teamId();

        if ($teamId === null) {
            return $this->loadPlanDtos()->map(fn (PlanDto $dto) => $this->withPrices($dto, $currentRates));
        }

        $rows = Cache::remember(
            BillingCacheKeys::plansList($teamId),
            config('billing.cache_ttl_seconds'),
            fn (): array => $this->loadPlanDtos()->map(
                fn (PlanDto $dto): array => $dto->toArray()
            )->all(),
        );

        return collect($rows)
            ->map(fn (array $row): PlanDto => PlanDto::from($row))
            ->map(fn (PlanDto $dto) => $this->withPrices($dto, $currentRates));
    }

    public function getPlan(Plan $plan): PlanDto
    {
        $plan->loadMissing('product');
        $allowedProductIds = $this->apiKeyAllowedProductIds();
        if ($allowedProductIds !== null && ! in_array((int) $plan->product_id, $allowedProductIds, true)) {
            abort(404);
        }

        $teamId = $this->teamId();

        if ($teamId === null) {
            return $this->withPrices(PlanDto::from($plan), $this->fx->currentRates());
        }

        $row = Cache::remember(
            BillingCacheKeys::plan($teamId, (int) $plan->getKey()),
            config('billing.cache_ttl_seconds'),
            fn (): array => PlanDto::from($plan)->toArray(),
        );

        return $this->withPrices(PlanDto::from($row), $this->fx->currentRates());
    }

    public function createPlan(StorePlanData $data): PlanDto
    {
        $created = $this->plans->create($data->toRepositoryArray());
        $created->loadMissing('product');
        $this->forgetPlanListCache();

        return PlanDto::from($created);
    }

    public function updatePlan(Plan $plan, UpdatePlanData $data): PlanDto
    {
        $this->plans->update($plan, $data->toPayload());
        $refreshed = $plan->refresh()->loadMissing('product');
        $this->forgetPlanCaches($refreshed);

        return PlanDto::from($refreshed);
    }

    public function deletePlan(Plan $plan): void
    {
        $this->forgetPlanCaches($plan);
        $this->plans->delete($plan);
    }

    /**
     * Enrich a PlanDto with a `prices` map covering the base currency and all configured FX currencies.
     * Current rates are passed in to avoid repeated DB queries when processing a list of plans.
     *
     * @param  Collection<int, array{currency: string, rate: string, effective_date: string}>  $currentRates
     */
    private function withPrices(PlanDto $dto, Collection $currentRates): PlanDto
    {
        $prices = [ExchangeRateService::BASE => $dto->price];

        foreach ($currentRates as $rate) {
            try {
                $prices[$rate['currency']] = $this->fx->convertFromUsd($dto->price, $rate['currency']);
            } catch (Throwable) {
                // Rate disappeared between fetching the list and iterating; skip.
            }
        }

        return PlanDto::from([...$dto->toArray(), 'prices' => $prices]);
    }

    /**
     * @return Collection<int, PlanDto>
     */
    private function loadPlanDtos(): Collection
    {
        return $this->plans->all()->map(function (Plan $plan): PlanDto {
            $plan->loadMissing('product');

            return PlanDto::from($plan);
        });
    }

    private function teamId(): ?int
    {
        $id = data_get(auth()->user(), 'team_id');
        if ($id === null || $id === '') {
            return null;
        }

        return (int) $id;
    }

    /**
     * @return array<int>|null
     */
    private function apiKeyAllowedProductIds(): ?array
    {
        try {
            $ids = app('request')->attributes->get('api_key_product_ids');
        } catch (Throwable) {
            return null;
        }

        if ($ids === null) {
            return null;
        }

        if (! is_array($ids)) {
            return null;
        }

        return array_values(array_unique(array_map('intval', $ids)));
    }

    private function forgetPlanListCache(): void
    {
        $teamId = $this->teamId();
        if ($teamId !== null) {
            Cache::forget(BillingCacheKeys::plansList($teamId));
        }
    }

    private function forgetPlanCaches(Plan $plan): void
    {
        $teamId = (int) $plan->team_id;
        Cache::forget(BillingCacheKeys::plansList($teamId));
        Cache::forget(BillingCacheKeys::plan($teamId, (int) $plan->getKey()));
    }
}
