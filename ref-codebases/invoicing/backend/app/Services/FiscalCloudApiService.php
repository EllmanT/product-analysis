<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class FiscalCloudApiService
{
    private function fiscalPending()
    {
        $pending = Http::timeout(config('fiscalcloud.timeout'))
            ->acceptJson();

        $apiKey = config('fiscalcloud.api_key');
        if (is_string($apiKey) && $apiKey !== '') {
            $pending = $pending->withHeaders(['X-API-Key' => $apiKey]);
        }

        return $pending;
    }

    /**
     * Register a company in Fiscal Cloud e-invoicing.
     *
     * @param  array<string, string|null>  $fields
     * @return array<string, mixed>
     */
    public function registerEInvoicingCompany(array $fields, UploadedFile $taxCertificate): array
    {
        $url = config('fiscalcloud.base_url').'/einvoicing/companies';

        $pending = $this->fiscalPending()->asMultipart();

        try {
            Log::info('FiscalCloud company registration request', [
                'url' => $url,
                'fields' => array_keys(array_filter($fields, fn ($v) => $v !== null && $v !== '')),
                'tax_certificate_name' => $taxCertificate->getClientOriginalName(),
            ]);

            /** @var Response $response */
            $response = $pending
                ->attach(
                    'tax_certificate',
                    fopen($taxCertificate->getRealPath(), 'r'),
                    $taxCertificate->getClientOriginalName()
                )
                ->post($url, $fields);

            Log::info('FiscalCloud company registration response', [
                'status' => $response->status(),
                'body' => $response->json(),
            ]);
        } catch (ConnectionException $e) {
            Log::error('FiscalCloud company registration connection error', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);
            throw new RuntimeException('Unable to reach Fiscal Cloud API.', 502, $e);
        } catch (Throwable $e) {
            Log::error('FiscalCloud company registration request error', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);
            throw new RuntimeException('Fiscal Cloud request failed: '.$e->getMessage(), 502, $e);
        }

        if ($response->successful()) {
            $json = $response->json();
            if (! is_array($json)) {
                throw new RuntimeException('Invalid response from Fiscal Cloud API.', 502);
            }

            return $json;
        }

        $status = $response->status();
        $message = $response->json('message');
        if (! is_string($message) || $message === '') {
            $message = 'Fiscal Cloud company registration failed.';
        }

        throw new RuntimeException($message, $status >= 400 && $status < 600 ? $status : 502);
    }

    /**
     * Create a device for an e-invoicing company in Fiscal Cloud.
     *
     * Endpoint: POST /einvoicing/companies/{company}/devices
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function createEInvoicingCompanyDevice(string $companyId, array $payload = []): array
    {
        $companyId = trim($companyId);
        if ($companyId === '') {
            throw new RuntimeException('Fiscal Cloud company id is required.');
        }

        $url = config('fiscalcloud.base_url').'/einvoicing/companies/'.rawurlencode($companyId).'/devices';
        $pending = $this->fiscalPending()->asJson();

        try {
            Log::info('FiscalCloud device create request', [
                'url' => $url,
                'payload_keys' => array_keys($payload),
            ]);

            /** @var Response $response */
            $response = $pending->post($url, $payload);

            Log::info('FiscalCloud device create response', [
                'status' => $response->status(),
                'body' => $response->json(),
            ]);
        } catch (ConnectionException $e) {
            Log::error('FiscalCloud device create connection error', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);
            throw new RuntimeException('Unable to reach Fiscal Cloud API.', 502, $e);
        } catch (Throwable $e) {
            Log::error('FiscalCloud device create request error', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);
            throw new RuntimeException('Fiscal Cloud request failed: '.$e->getMessage(), 502, $e);
        }

        if ($response->successful()) {
            $json = $response->json();
            if (! is_array($json)) {
                throw new RuntimeException('Invalid response from Fiscal Cloud API.', 502);
            }

            return $json;
        }

        $status = $response->status();
        $message = $response->json('message');
        if (! is_string($message) || $message === '') {
            $message = 'Fiscal Cloud device creation failed.';
        }

        throw new RuntimeException($message, $status >= 400 && $status < 600 ? $status : 502);
    }

    /**
     * Activate a Fiscal Cloud e-invoicing device (generate certificate).
     *
     * Endpoint: POST /einvoicing/devices/{device}/activate
     *
     * @param  array{device_id:string, activation_key:string, environment:string}  $payload
     * @return array<string, mixed>
     */
    public function activateEInvoicingDevice(string $deviceId, array $payload): array
    {
        $deviceId = trim($deviceId);
        if ($deviceId === '') {
            throw new RuntimeException('Fiscal Cloud device id is required.');
        }

        $url = config('fiscalcloud.base_url').'/einvoicing/devices/'.rawurlencode($deviceId).'/activate';
        $pending = $this->fiscalPending()->asJson();

        try {
            Log::info('FiscalCloud device activation request', [
                'url' => $url,
                'environment' => $payload['environment'] ?? null,
            ]);

            /** @var Response $response */
            $response = $pending->post($url, $payload);

            Log::info('FiscalCloud device activation response', [
                'status' => $response->status(),
                'body' => $response->json(),
            ]);
        } catch (ConnectionException $e) {
            Log::error('FiscalCloud device activation connection error', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);
            throw new RuntimeException('Unable to reach Fiscal Cloud API.', 502, $e);
        } catch (Throwable $e) {
            Log::error('FiscalCloud device activation request error', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);
            throw new RuntimeException('Fiscal Cloud request failed: '.$e->getMessage(), 502, $e);
        }

        if ($response->successful()) {
            $json = $response->json();
            if (! is_array($json)) {
                throw new RuntimeException('Invalid response from Fiscal Cloud API.', 502);
            }

            return $json;
        }

        $status = $response->status();
        $message = $response->json('message');
        if (! is_string($message) || $message === '') {
            $message = 'Fiscal Cloud device activation failed.';
        }

        throw new RuntimeException($message, $status >= 400 && $status < 600 ? $status : 502);
    }
}
