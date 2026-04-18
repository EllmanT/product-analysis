<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Omari merchant payment API client, ported from the omari_integration Flutter package:
 * POST auth, POST requests, GET query/{reference}, POST void.
 *
 * Base URLs match OmariPayments.init in omari_integration.dart.
 */
final class OmariService
{
    private const UAT_MERCHANT_BASE = 'https://omari.v.co.zw/uat/vsuite/omari/api/merchant/api/payment';

    private const PROD_MERCHANT_BASE = 'https://omari.v.co.zw/vsuite/omari/api/merchant/api/payment';

    /**
     * Step 1: Request OTP / authorisation for a debit against msisdn.
     *
     * @param  array{msisdn: string, reference: string, amount: float|int, currency: string, channel: string}  $payload
     * @return array<string, mixed> Decoded JSON (error, message, responseCode, otpReference, …)
     *
     * @throws ConnectionException|RuntimeException
     */
    public function authenticate(array $payload): array
    {
        return $this->decodeJsonResponse(
            $this->client()->post('auth', $payload),
        );
    }

    /**
     * Step 2: Confirm payment with OTP from the customer.
     *
     * @param  array{msisdn: string, reference: string, otp: string}  $payload
     * @return array<string, mixed> Decoded JSON (paymentReference, debitReference, …)
     *
     * @throws ConnectionException|RuntimeException
     */
    public function submitRequest(array $payload): array
    {
        return $this->decodeJsonResponse(
            $this->client()->post('requests', $payload),
        );
    }

    /**
     * Query payment status by merchant reference.
     *
     * @return array<string, mixed> Decoded JSON (status, reference, amount, currency, channel, …)
     *
     * @throws ConnectionException|RuntimeException
     */
    public function query(string $reference): array
    {
        $path = 'query/'.rawurlencode($reference);

        return $this->decodeJsonResponse(
            $this->client()->get($path),
        );
    }

    /**
     * Void / reverse a payment by merchant reference.
     *
     * @param  array{reference: string}  $payload
     * @return array<string, mixed>
     *
     * @throws ConnectionException|RuntimeException
     */
    public function voidPayment(array $payload): array
    {
        return $this->decodeJsonResponse(
            $this->client()->post('void', $payload),
        );
    }

    public function merchantBaseUrl(): string
    {
        $override = config('omari.merchant_base_url');
        if (is_string($override) && $override !== '') {
            return rtrim($override, '/');
        }

        return config('omari.production') ? self::PROD_MERCHANT_BASE : self::UAT_MERCHANT_BASE;
    }

    /**
     * Human-readable label for Omari responseCode values (ISO-style codes from the gateway).
     */
    public static function describeResponseCode(string $code): string
    {
        return match ($code) {
            '000' => 'APPROVED',
            '001' => 'CONTACT_ISSUER',
            '003' => 'INVALID_MERCHANT',
            '005' => 'DO_NOT_HONOUR',
            '006' => 'ERROR',
            '009' => 'REQUEST_IN_PROGRESS',
            '010' => 'APPROVED_PARTIAL',
            '012' => 'INVALID_TRANSACTION',
            '013' => 'INVALID_AMOUNT',
            '014' => 'INVALID_CARD',
            '015' => 'NO_SUCH_ISSUER',
            '019' => 'REENTER_TRANSACTION',
            '020' => 'INVALID_RESPONSE',
            '021' => 'NO_ACTION_TAKEN',
            '025' => 'NOT_FOUND',
            '026' => 'DUPLICATE',
            '027' => 'INCOMPLETE',
            '030' => 'FORMAT_ERROR',
            '040' => 'FUNCTION_NOT_SUPPORTED',
            '041' => 'CARD_ON_HOLD',
            '042' => 'INVALID_ACCOUNT',
            '045' => 'ACCOUNT_CLOSED',
            '048' => 'NO_CUSTOMER_RECORD',
            '051' => 'INSUFFICIENT_FUNDS',
            '054' => 'EXPIRED_CARD',
            '055' => 'INVALID_PIN',
            '057' => 'TRANSACTION_NOT_PERMITTED',
            '060' => 'CONTACT_ACQUIRER',
            '061' => 'EXCEEDS_LIMIT',
            '062' => 'RESTRICTED_CARD',
            '063' => 'SECURITY_VIOLATION',
            '067' => 'PICK_UP_CARD',
            '075' => 'PIN_TRIES_EXCEEDED',
            '091' => 'TIMEOUT',
            '092' => 'ROUTING_ERROR',
            '095' => 'RECONCILIATION_ERROR',
            '096' => 'SYSTEM_MALFUNCTION',
            default => 'UNKNOWN',
        };
    }

    private function client(): PendingRequest
    {
        $key = config('omari.merchant_api_key');
        if (! is_string($key) || $key === '') {
            throw new RuntimeException('Omari merchant API key is not configured (OMARI_MERCHANT_API_KEY).');
        }

        return Http::baseUrl($this->merchantBaseUrl())
            ->withHeaders([
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',
                'X-Merchant-Key' => $key,
            ])
            ->timeout((int) config('omari.timeout', 30))
            ->connectTimeout((int) config('omari.connect_timeout', 10));
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeJsonResponse(Response $response): array
    {
        if ($response->failed()) {
            throw new RuntimeException(
                sprintf('Omari API HTTP %d: %s', $response->status(), $response->body()),
                $response->status(),
            );
        }

        $json = $response->json();
        if (! is_array($json)) {
            throw new RuntimeException('Omari API returned a non-JSON response.');
        }

        return $json;
    }
}
