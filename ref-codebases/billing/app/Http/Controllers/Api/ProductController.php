<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Api\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\ProductService;
use Illuminate\Http\JsonResponse;

final class ProductController extends Controller
{
    public function __construct(
        private readonly ProductService $productService,
    ) {}

    /**
     * List all products
     */
    public function index(): JsonResponse
    {
        return ApiResponse::ok($this->productService->listProducts());
    }

    /**
     * Get a single product
     */
    public function show(Product $product): JsonResponse
    {
        return ApiResponse::ok($this->productService->getProduct($product));
    }
}
