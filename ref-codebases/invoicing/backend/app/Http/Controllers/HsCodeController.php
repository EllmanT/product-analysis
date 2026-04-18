<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreHsCodeRequest;
use App\Http\Requests\UpdateHsCodeRequest;
use App\Models\HsCode;
use App\Repositories\Interfaces\HsCodeRepositoryInterface;
use Illuminate\Http\Request;

class HsCodeController extends Controller
{
    public function __construct(
        protected HsCodeRepositoryInterface $repository
    ) {}

    /**
     * Get a paginated list of HS codes (reference data; read-only for API consumers).
     */
    public function index(Request $request)
    {
        $perPage = min(max($request->integer('per_page', 50), 1), 200);

        $query = HsCode::query()->orderBy('code');

        if ($request->filled('search')) {
            $search = $request->string('search')->trim();
            $query->where(function ($q) use ($search): void {
                $q->where('code', 'like', '%'.$search.'%')
                    ->orWhere('description', 'like', '%'.$search.'%');
            });
        }

        return response()->json($query->paginate($perPage));
    }

    /**
     * Get a single HS code by ID.
     */
    public function show(string|int $hs_code)
    {
        $model = $this->repository->find($hs_code);
        if (!$model) {
            return response()->json(['message' => 'Not found'], 404);
        }
        return response()->json($model);
    }

    /**
     * Create a new HS code.
     */
    public function store(StoreHsCodeRequest $request)
    {
        $model = $this->repository->create($request->validated());
        return response()->json($model, 201);
    }

    /**
     * Update an existing HS code.
     */
    public function update(UpdateHsCodeRequest $request, string|int $id)
    {
        $model = $this->repository->update($id, $request->validated());
        return response()->json($model);
    }

    /**
     * Delete an HS code.
     */
    public function destroy(string|int $id)
    {
        $this->repository->delete($id);
        return response()->json(null, 204);
    }
}
