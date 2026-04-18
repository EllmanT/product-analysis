<?php

namespace App\Repositories;

use App\Repositories\Interfaces\RepositoryInterface;
use Illuminate\Database\Eloquent\Model;

abstract class BaseRepository implements RepositoryInterface
{
    public function __construct(
        protected string $modelClass
    ) {}

    public function all(): \Illuminate\Database\Eloquent\Collection
    {
        return $this->modelClass::all();
    }

    public function find(int|string $id): ?Model
    {
        return $this->modelClass::find($id);
    }

    public function create(array $data): Model
    {
        return $this->modelClass::create($data);
    }

    public function update(int|string $id, array $data): Model
    {
        $model = $this->modelClass::findOrFail($id);
        $model->update($data);
        return $model->fresh();
    }

    public function delete(int|string $id): bool
    {
        return $this->modelClass::findOrFail($id)->delete();
    }
}
