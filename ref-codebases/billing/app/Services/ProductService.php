<?php

declare(strict_types=1);

namespace App\Services;

use App\Data\Api\StoreProductData;
use App\Data\Api\UpdateProductData;
use App\Data\ProductDto;
use App\Models\Plan;
use App\Models\Product;
use App\Repositories\Interfaces\ProductRepositoryInterface;
use App\Support\BillingCacheKeys;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

final class ProductService
{
    public function __construct(
        private readonly ProductRepositoryInterface $products,
    ) {}

    /**
     * @return Collection<int, ProductDto>
     */
    public function listProducts(): Collection
    {
        $allowedProductIds = $this->apiKeyAllowedProductIds();
        if ($allowedProductIds !== null) {
            if ($allowedProductIds === []) {
                return collect();
            }

            return Product::query()
                ->whereIn('id', $allowedProductIds)
                ->orderBy('name')
                ->get()
                ->map(fn (Product $product): ProductDto => ProductDto::from($product));
        }

        $teamId = $this->teamId();
        if ($teamId === null) {
            return $this->loadProductDtos();
        }

        $rows = Cache::remember(
            BillingCacheKeys::productsList($teamId),
            config('billing.cache_ttl_seconds'),
            fn (): array => $this->loadProductDtos()->map(
                fn (ProductDto $dto): array => $dto->toArray()
            )->all(),
        );

        return collect($rows)->map(fn (array $row): ProductDto => ProductDto::from($row));
    }

    public function getProduct(Product $product): ProductDto
    {
        $allowedProductIds = $this->apiKeyAllowedProductIds();
        if ($allowedProductIds !== null && ! in_array((int) $product->getKey(), $allowedProductIds, true)) {
            abort(404);
        }

        $teamId = $this->teamId();
        if ($teamId === null) {
            return ProductDto::from($product);
        }

        $row = Cache::remember(
            BillingCacheKeys::product($teamId, (int) $product->getKey()),
            config('billing.cache_ttl_seconds'),
            fn (): array => ProductDto::from($product)->toArray(),
        );

        return ProductDto::from($row);
    }

    public function createProduct(StoreProductData $data): ProductDto
    {
        $created = $this->products->create($data->toArray());
        $this->forgetProductListCache();

        return ProductDto::from($created);
    }

    public function updateProduct(Product $product, UpdateProductData $data): ProductDto
    {
        $this->products->update($product, $data->toPayload());
        $refreshed = $product->refresh();
        $this->forgetProductCaches($refreshed);
        $this->forgetPlanCachesForProduct($refreshed);

        return ProductDto::from($refreshed);
    }

    public function deleteProduct(Product $product): void
    {
        $this->forgetProductCaches($product);
        $this->forgetPlanCachesForProduct($product);
        $this->products->delete($product);
    }

    /**
     * @return Collection<int, ProductDto>
     */
    private function loadProductDtos(): Collection
    {
        return $this->products->all()->map(
            fn (Product $product): ProductDto => ProductDto::from($product)
        );
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
        } catch (\Throwable) {
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

    private function forgetProductListCache(): void
    {
        $teamId = $this->teamId();
        if ($teamId !== null) {
            Cache::forget(BillingCacheKeys::productsList($teamId));
        }
    }

    private function forgetProductCaches(Product $product): void
    {
        $teamId = (int) $product->team_id;
        Cache::forget(BillingCacheKeys::productsList($teamId));
        Cache::forget(BillingCacheKeys::product($teamId, (int) $product->getKey()));
    }

    private function forgetPlanCachesForProduct(Product $product): void
    {
        $teamId = (int) $product->team_id;
        Cache::forget(BillingCacheKeys::plansList($teamId));
        $planIds = Plan::query()->where('product_id', $product->getKey())->pluck('id');
        foreach ($planIds as $planId) {
            Cache::forget(BillingCacheKeys::plan($teamId, (int) $planId));
        }
    }
}
