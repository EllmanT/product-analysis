<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Data\Api\StoreUserData;
use App\Data\Api\UpdateUserData;
use App\Http\Api\ApiResponse;
use App\Models\User;
use App\Services\UserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class UserController extends Controller
{
    public function __construct(
        private readonly UserService $userService,
    ) {}

    public function index(): JsonResponse
    {
        return ApiResponse::ok($this->userService->listUsers());
    }

    public function show(User $user): JsonResponse
    {
        return ApiResponse::ok($this->userService->getUser($user));
    }

    public function store(Request $request): JsonResponse
    {
        $data = StoreUserData::fromRequest($request);

        return ApiResponse::created($this->userService->createUser($data));
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = UpdateUserData::fromRequest($request, $user);

        return ApiResponse::ok($this->userService->updateUser($user, $data));
    }

    public function destroy(User $user): JsonResponse
    {
        try {
            $this->userService->deleteUser($user);
        } catch (RuntimeException $e) {
            return ApiResponse::error($e->getMessage(), 422);
        }

        return ApiResponse::noContent();
    }
}
