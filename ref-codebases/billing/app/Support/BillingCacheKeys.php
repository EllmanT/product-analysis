<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Tenant-scoped cache keys for catalog reads (products, plans).
 */
final class BillingCacheKeys
{
    public static function productsList(int $teamId): string
    {
        return "billing:{$teamId}:products:list";
    }

    public static function product(int $teamId, int $productId): string
    {
        return "billing:{$teamId}:products:{$productId}";
    }

    public static function plansList(int $teamId): string
    {
        return "billing:{$teamId}:plans:list";
    }

    public static function plan(int $teamId, int $planId): string
    {
        return "billing:{$teamId}:plans:{$planId}";
    }
}
