<?php

namespace App\Services;

use RuntimeException;

class ProductTemplatePicker
{
    /**
     * @return array<int, array<string, mixed>>
     */
    public function pick(string $relativePath, int $count = 1): array
    {
        $path = $this->resolveTemplatePath($relativePath);
        if (! is_file($path)) {
            throw new RuntimeException("Missing template file {$relativePath} (resolved: {$path}).");
        }

        $json = file_get_contents($path);
        if (! is_string($json)) {
            throw new RuntimeException("Failed to read template file {$relativePath} (resolved: {$path}).");
        }

        $data = json_decode($json, true);

        if (! is_array($data)) {
            throw new RuntimeException("Invalid JSON in {$relativePath}: ".json_last_error_msg());
        }

        $data = array_values(array_filter($data, static fn ($x) => is_array($x) && isset($x['name'])));
        if (count($data) < $count) {
            throw new RuntimeException("Not enough products in {$relativePath} (need {$count})");
        }

        shuffle($data);

        return array_slice($data, 0, $count);
    }

    private function resolveTemplatePath(string $relativePath): string
    {
        $p = ltrim($relativePath, '/');
        if (str_starts_with($p, 'templates/')) {
            $p = substr($p, strlen('templates/'));
        }

        return storage_path('app/templates/'.$p);
    }
}
