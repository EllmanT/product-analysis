<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class DocsAiApiService
{
    private function pending()
    {
        return Http::connectTimeout((int) config('services.docs_ai.connect_timeout', 10))
            ->timeout((int) config('services.docs_ai.timeout', 30))
            ->acceptJson();
    }

    /**
     * Register company/device with ZIMRA docs-ai service.
     *
     * Endpoint: POST {base_url}/api/docs-ai/register-company
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function registerCompany(array $payload): array
    {
        $baseUrl = (string) config('services.docs_ai.base_url', '');
        $baseUrl = rtrim($baseUrl, '/');
        if ($baseUrl === '') {
            throw new RuntimeException('Docs AI base URL is not configured.');
        }

        $url = $baseUrl.'/api/docs-ai/register-company';

        try {
            Log::info('DocsAI register-company request', [
                'url' => $url,
                'payload_keys' => array_keys($payload),
            ]);

            /** @var Response $response */
            $response = $this->pending()->asJson()->post($url, $payload);

            Log::info('DocsAI register-company response', [
                'status' => $response->status(),
                'body' => $response->json(),
            ]);
        } catch (ConnectionException $e) {
            Log::error('DocsAI register-company connection error', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);
            throw new RuntimeException('Unable to reach Docs AI service.', 502, $e);
        } catch (Throwable $e) {
            Log::error('DocsAI register-company request error', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);
            throw new RuntimeException('Docs AI request failed: '.$e->getMessage(), 502, $e);
        }

        if ($response->successful()) {
            $json = $response->json();
            if (! is_array($json)) {
                throw new RuntimeException('Invalid response from Docs AI service.', 502);
            }

            return $json;
        }

        $status = $response->status();
        $message = $response->json('message');
        if (! is_string($message) || $message === '') {
            $message = 'Docs AI registration failed.';
        }

        throw new RuntimeException($message, $status >= 400 && $status < 600 ? $status : 502);
    }
}

