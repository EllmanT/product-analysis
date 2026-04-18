<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\ApiKey;
use App\Models\Product;
use Illuminate\Support\Collection;

final class ApiKeyService
{
    /** @return Collection<int, array<string, mixed>> */
    public function list(): Collection
    {
        return ApiKey::query()
            ->latest()
            ->get()
            ->map(fn (ApiKey $k) => [
                'id' => $k->id,
                'name' => $k->name,
                'masked' => $k->masked,
                'last_used_at' => $k->last_used_at?->diffForHumans(),
                'expires_at' => $k->expires_at?->toDateString(),
                'created_at' => $k->created_at->toDateString(),
            ]);
    }

    /**
     * Generate a new API key, persist it, and return the raw value.
     *
     * @param  array{name: string, expires_at?: string|null, product_ids: array<int, int|string>}  $data
     * @return string The raw (plaintext) key — only available at generation time.
     */
    public function generate(int $teamId, array $data): string
    {
        $generated = ApiKey::generate();

        /** @var ApiKey $key */
        $key = ApiKey::create([
            'team_id' => $teamId,
            'name' => $data['name'],
            'key_prefix' => $generated['prefix'],
            'key_hash' => $generated['hash'],
            'expires_at' => $data['expires_at'] ?? null,
        ]);

        $productIds = array_values(array_unique(array_map('intval', $data['product_ids'] ?? [])));
        if ($productIds !== []) {
            $allowed = Product::query()
                ->where('team_id', $teamId)
                ->whereIn('id', $productIds)
                ->pluck('id')
                ->all();

            $key->products()->sync($allowed);
        }

        return $generated['raw'];
    }

    public function revoke(int $id): void
    {
        ApiKey::findOrFail($id)->delete();
    }
}
