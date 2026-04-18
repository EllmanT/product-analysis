<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * OPPWA Copy & Pay checkout API (used for ZimSwitch card / DB flows).
 *
 * @phpstan-type CheckoutCreateResult array{id?: string, result?: array{code?: string, description?: string}}
 */
final class ZimswitchCopyPayService
{
    public function __construct(
        private readonly ZimswitchPaymentStatusMapper $statusMapper,
    ) {}

    /**
     * Create a checkout session (POST v1/checkouts with query params — matches legacy integration).
     *
     * @return array{id: string, result: array{code?: string, description?: string}, raw: array<string, mixed>}
     *
     * @throws ConnectionException|RuntimeException
     */
    public function createCheckout(string $amount, string $currency, string $entityId, string $paymentType): array
    {
        $token = $this->requireToken();
        $base = $this->baseUrl();
        $amount = number_format((float) $amount, 2, '.', '');
        $currency = strtoupper($currency);

        $url = "{$base}/v1/checkouts?".http_build_query([
            'entityId' => $entityId,
            'amount' => $amount,
            'currency' => $currency,
            'paymentType' => $paymentType,
        ]);

        $client = $this->httpClient($token)->acceptJson();

        $response = $client->post($url);

        /** @var array<string, mixed> $data */
        $data = $response->json() ?? [];

        Log::channel('zimswitch')->info('ZimSwitch: OPPWA external response (createCheckout)', [
            'http_status' => $response->status(),
            'payload' => $data,
            'raw_body' => $response->body(),
        ]);

        if (! $response->successful()) {
            $desc = data_get($data, 'result.description', $response->body());

            throw new RuntimeException('ZimSwitch checkout preparation failed: '.(is_string($desc) ? $desc : $response->body()));
        }

        $id = data_get($data, 'id');
        if (! is_string($id) || $id === '') {
            throw new RuntimeException('ZimSwitch checkout response missing id.');
        }

        /** @var array{code?: string, description?: string} $result */
        $result = is_array(data_get($data, 'result')) ? $data['result'] : [];

        return [
            'id' => $id,
            'result' => $result,
            'raw' => $data,
        ];
    }

    /**
     * Fetch payment outcome for a checkout (GET v1/checkouts/{id}/payment).
     *
     * @return array{
     *     raw: array<string, mixed>,
     *     result_code: ?string,
     *     message: string,
     *     extended_description: ?string,
     *     category: string,
     *     payment_status: 'success'|'pending'|'failed',
     *     success: bool,
     *     pending: bool,
     *     rejected: bool,
     *     requires_review: bool,
     * }
     *
     * @throws ConnectionException
     */
    public function fetchPaymentStatus(string $checkoutId, string $entityId): array
    {
        $token = $this->requireToken();
        $base = $this->baseUrl();

        $url = "{$base}/v1/checkouts/".rawurlencode($checkoutId).'/payment?'.http_build_query([
            'entityId' => $entityId,
        ]);

        $response = $this->httpClient($token)->acceptJson()->get($url);

        /** @var array<string, mixed> $data */
        $data = $response->json() ?? [];

        Log::channel('zimswitch')->info('ZimSwitch: OPPWA external response (fetchPaymentStatus)', [
            'checkout_id' => $checkoutId,
            'http_status' => $response->status(),
            'payload' => $data,
            'raw_body' => $response->body(),
        ]);

        if (! $response->successful()) {
            return [
                'raw' => $data,
                'result_code' => null,
                'message' => 'Failed to retrieve payment status',
                'extended_description' => null,
                'category' => 'unknown',
                'payment_status' => 'failed',
                'success' => false,
                'pending' => false,
                'rejected' => false,
                'requires_review' => false,
            ];
        }

        /** @var string|null $resultCode */
        $resultCode = data_get($data, 'result.code');
        $resultCode = is_string($resultCode) ? $resultCode : null;
        $gatewayDescription = (string) data_get($data, 'result.description', 'Unknown status');
        $extended = data_get($data, 'resultDetails.ExtendedDescription');
        $extended = is_string($extended) ? $extended : null;

        if ($resultCode === null || $resultCode === '') {
            return [
                'raw' => $data,
                'result_code' => null,
                'message' => 'Payment status response missing result code',
                'extended_description' => $extended,
                'category' => 'unknown',
                'payment_status' => 'failed',
                'success' => false,
                'pending' => false,
                'rejected' => false,
                'requires_review' => false,
            ];
        }

        $isSuccess = $this->statusMapper->isSuccess($resultCode);
        $isSuccessWithReview = $this->statusMapper->isSuccessWithReview($resultCode);
        $isPending = $this->statusMapper->isAnyPending($resultCode);
        $isRejected = $this->statusMapper->isRejected($resultCode);
        $category = $this->statusMapper->getStatusCategory($resultCode);
        $codeDescription = $this->statusMapper->getDescription($resultCode);
        $summary = $this->statusMapper->getStatusSummary($resultCode);

        // Prefer our bundled result code descriptions, but fall back to gateway text when unknown.
        $description = $codeDescription === 'Unknown status code' && $gatewayDescription !== '' ? $gatewayDescription : $codeDescription;

        $paymentStatus = 'failed';
        $success = false;

        if ($isSuccess || $isSuccessWithReview) {
            $paymentStatus = 'success';
            $success = true;
        } elseif ($isPending) {
            $paymentStatus = 'pending';
            $success = false;
        } elseif ($isRejected) {
            $paymentStatus = 'failed';
            $success = false;
        }

        return [
            'raw' => $data,
            'result_code' => $resultCode,
            'message' => $summary,
            'description' => $description,
            'gateway_description' => $gatewayDescription,
            'extended_description' => $extended,
            'category' => $category,
            'payment_status' => $paymentStatus,
            'success' => $success,
            'pending' => $isPending,
            'rejected' => $isRejected,
            'requires_review' => $isSuccessWithReview,
        ];
    }

    private function baseUrl(): string
    {
        $url = config('zimswitch.base_url');
        if (! is_string($url) || $url === '') {
            throw new RuntimeException('ZimSwitch base URL is not configured (ZIMSWITCH_BASE_URL).');
        }

        return rtrim($url, '/');
    }

    private function requireToken(): string
    {
        $token = config('zimswitch.authorization_token');
        if (! is_string($token) || $token === '') {
            throw new RuntimeException('ZimSwitch authorization token is not configured (ZIMSWITCH_AUTHORIZATION_TOKEN).');
        }

        return $token;
    }

    private function httpClient(string $token): PendingRequest
    {
        $pending = Http::withToken($token)
            ->timeout((int) config('zimswitch.timeout', 30))
            ->connectTimeout((int) config('zimswitch.connect_timeout', 10));

        if (! config('zimswitch.verify_ssl', true)) {
            $pending = $pending->withoutVerifying();
        }

        $testMode = config('zimswitch.test_mode_header');
        if (is_string($testMode) && $testMode !== '') {
            $pending = $pending->withHeaders(['testMode' => $testMode]);
        }

        return $pending;
    }
}
