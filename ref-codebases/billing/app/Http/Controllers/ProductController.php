<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Data\Api\StoreProductData;
use App\Data\Api\UpdateProductData;
use App\Data\ProductDto;
use App\Models\Product;
use App\Services\ProductService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class ProductController extends Controller
{
    public function __construct(
        private readonly ProductService $productService,
    ) {}

    public function index(Request $request): Response
    {
        $q = trim((string) $request->query('q', ''));
        $perPage = max(5, min(100, (int) $request->query('per_page', 10)));

        $query = Product::query()->orderBy('name');
        if ($q !== '') {
            $needle = mb_strtolower($q);
            $like = '%'.$needle.'%';
            $query->where(function ($qb) use ($like): void {
                $qb->whereRaw('LOWER(name) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(COALESCE(description, \'\')) LIKE ?', [$like]);
            });
        }

        $p = $query->paginate($perPage)->withQueryString();
        $p->setCollection(
            $p->getCollection()->map(fn (Product $product) => ProductDto::from($product)->toArray())
        );

        return Inertia::render('products/Index', [
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
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = StoreProductData::fromRequest($request);

        return response()->json([
            'data' => $this->productService->createProduct($data)->toArray(),
        ], 201);
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $data = UpdateProductData::fromRequest($request);

        return response()->json([
            'data' => $this->productService->updateProduct($product, $data)->toArray(),
        ]);
    }

    public function destroy(Product $product): JsonResponse
    {
        $this->productService->deleteProduct($product);

        return response()->json(null, 204);
    }
}
