<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\ApiKey;
use App\Models\Product;
use App\Services\ApiKeyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

final class ApiKeyController extends Controller
{
    public function __construct(
        private readonly ApiKeyService $service,
    ) {}

    public function index(Request $request): Response
    {
        $teamId = (int) ($request->attributes->get('tenant_id') ?? auth()->user()?->team_id);
        $q = trim((string) $request->query('q', ''));
        $perPage = max(5, min(100, (int) $request->query('per_page', 10)));

        $query = ApiKey::query()->where('team_id', $teamId)->latest();
        if ($q !== '') {
            $needle = mb_strtolower($q);
            $like = '%'.$needle.'%';
            $query->where(function ($qb) use ($like): void {
                $qb->whereRaw('LOWER(name) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(key_prefix) LIKE ?', [$like]);
            });
        }

        $p = $query->paginate($perPage)->withQueryString();
        $p->setCollection(
            $p->getCollection()->map(fn (ApiKey $k) => [
                'id' => $k->id,
                'name' => $k->name,
                'masked' => $k->masked,
                'last_used_at' => $k->last_used_at?->diffForHumans(),
                'expires_at' => $k->expires_at?->toDateString(),
                'created_at' => $k->created_at->toDateString(),
            ])
        );

        $products = Product::query()
            ->where('team_id', $teamId)
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn (Product $p) => ['id' => $p->id, 'name' => $p->name])
            ->all();

        return Inertia::render('api-keys/Index', [
            'apiKeys' => [
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
            'products' => $products,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'expires_at' => ['nullable', 'date', 'after:today'],
            'product_ids' => ['required', 'array', 'min:1'],
            'product_ids.*' => [
                'integer',
                Rule::exists('products', 'id')->where(function ($q) use ($request): void {
                    $teamId = (int) ($request->attributes->get('tenant_id') ?? auth()->user()?->team_id);
                    $q->where('team_id', $teamId);
                }),
            ],
        ]);

        $teamId = (int) ($request->attributes->get('tenant_id') ?? auth()->user()?->team_id);
        $raw = $this->service->generate($teamId, $validated);

        return response()->json(['key' => $raw], 201);
    }

    public function destroy(int $id): JsonResponse
    {
        $this->service->revoke($id);

        return response()->json(['message' => 'API key revoked.']);
    }
}
