<?php

namespace App\Repositories\Interfaces;

interface RepositoryInterface
{
    public function all(): \Illuminate\Database\Eloquent\Collection;

    public function find(int|string $id): ?\Illuminate\Database\Eloquent\Model;

    public function create(array $data): \Illuminate\Database\Eloquent\Model;

    public function update(int|string $id, array $data): \Illuminate\Database\Eloquent\Model;

    public function delete(int|string $id): bool;
}
