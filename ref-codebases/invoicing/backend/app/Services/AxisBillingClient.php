<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\AxisBillingException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

final class AxisBillingClient
{
    public function listProducts(): array
    {
        return $this->getJson('/api/products');
    }

    public function getProduct(string|int $id): array
    {
        return $this->getJson('/api/products/'.$id);
    }

    public function listPlans(): array
    {
        return $this->getJson('/api/plans');
    }

    public function getPlan(string|int $id): array
    {
        return $this->getJson('/api/plans/'.$id);
    }

    public function listSubscriptions(): array
    {
        return $this->getJson('/api/subscriptions');
    }

    public function getSubscription(string|int $id): array
    {
        return $this->getJson('/api/subscriptions/'.$id);
    }

    /** @param array<string, mixed> $payload */
    public function createSubscription(array $payload): array
    {
        return $this->sendJson('post', '/api/subscriptions', $payload);
    }

    /** @param array<string, mixed> $payload */
    public function updateSubscription(string|int $id, array $payload): array
    {
        return $this->sendJson('patch', '/api/subscriptions/'.$id, $payload);
    }

    public function deleteSubscription(string|int $id): array
    {
        return $this->sendJson('delete', '/api/subscriptions/'.$id);
    }

    public function subscriptionsByCustomer(string|int $customerId): array
    {
        return $this->getJson('/api/customers/'.$customerId.'/subscriptions');
    }

    public function activateSubscription(string|int $id): array
    {
        return $this->sendJson('post', '/api/subscriptions/'.$id.'/activate');
    }

    /** @param array<string, mixed> $payload */
    public function cancelSubscription(string|int $id, array $payload = []): array
    {
        return $this->sendJson('post', '/api/subscriptions/'.$id.'/cancel', $payload);
    }

    /** @param array<string, mixed> $payload */
    public function renewSubscription(string|int $id, array $payload = []): array
    {
        return $this->sendJson('post', '/api/subscriptions/'.$id.'/renew', $payload);
    }

    /** @param array<string, mixed> $payload */
    public function transitionSubscriptionStatus(string|int $id, array $payload): array
    {
        return $this->sendJson('post', '/api/subscriptions/'.$id.'/transition-status', $payload);
    }

    /** @param array<string, mixed> $payload */
    public function createCheckoutSession(array $payload): array
    {
        return $this->sendJson('post', '/api/checkout-sessions', $payload);
    }

    public function getCheckoutSession(string $publicId): array
    {
        return $this->getJson('/api/checkout-sessions/'.$publicId);
    }

    private function getJson(string $path): array
    {
        return $this->sendJson('get', $path);
    }

    /** @param array<string, mixed> $payload */
    private function sendJson(string $method, string $path, array $payload = []): array
    {
        try {
            /** @var Response $response */
            $response = $this->request()
                ->send($method, $this->normalizePath($path), $payload === [] ? [] : ['json' => $payload])
                ->throw();
        } catch (RequestException $e) {
            $status = $e->response?->status();
            $message = $this->safeErrorMessageFromResponse($e->response);
            throw new AxisBillingException($message, $status ?? 502, $e);
        }

        $json = $response->json();
        if (! is_array($json)) {
            throw new AxisBillingException('Axis Billing returned invalid JSON.', 502);
        }

        return $json;
    }

    private function request(): PendingRequest
    {
        $baseUrl = (string) config('services.axis_billing.base_url');
        $apiKey = (string) config('services.axis_billing.api_key');

        if ($baseUrl === '' || $apiKey === '') {
            throw new AxisBillingException('Axis Billing is not configured.', 500);
        }

        return Http::baseUrl($this->normalizeBaseUrl($baseUrl))
            ->acceptJson()
            ->asJson()
            ->withHeaders([
                'X-API-Key' => $apiKey,
            ]);
    }

    private function normalizeBaseUrl(string $baseUrl): string
    {
        $base = rtrim($baseUrl, '/');

        // Allow env to be either "https://axis-billing.tld" OR "https://axis-billing.tld/api".
        if (str_ends_with($base, '/api')) {
            $base = substr($base, 0, -4);
        }

        return $base;
    }

    private function normalizePath(string $path): string
    {
        $p = '/'.ltrim($path, '/');

        // We want exactly one "/api" segment at the beginning.
        if (! str_starts_with($p, '/api/')) {
            $p = '/api'.($p === '/' ? '' : $p);
        }

        return $p;
    }

    private function safeErrorMessageFromResponse(?Response $response): string
    {
        if ($response === null) {
            return 'Axis Billing request failed.';
        }

        $msg = $response->json('message');
        if (is_string($msg) && trim($msg) !== '') {
            return trim($msg);
        }

        return 'Axis Billing request failed.';
    }
}

