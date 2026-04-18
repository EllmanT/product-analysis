<?php

namespace App\Jobs;

use App\Models\CompanyDevice;
use App\Services\DocsAiApiService;
use App\Services\FiscalCloudApiService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class ActivateFiscalCloudDeviceJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 5;

    public int $timeout = 120;

    /** @var list<int> */
    public array $backoff = [5, 10, 30, 60, 120];

    public function __construct(
        public string $companyDeviceId,
        public string $environment = 'test'
    ) {}

    public function handle(DocsAiApiService $docsAi, FiscalCloudApiService $fiscalCloud): void
    {
        /** @var CompanyDevice|null $device */
        $device = CompanyDevice::query()->where('id', $this->companyDeviceId)->first();
        if (! $device) {
            return;
        }

        // Idempotency: if already activated, don't rerun.
        if ($device->fiscal_cloud_activated_at !== null) {
            if ($device->zimra_fdms_template_emailed_at === null) {
                SendZimraFdmsTemplateEmailJob::dispatch((string) $device->id);
            }

            return;
        }

        if (! is_string($device->fiscal_device_id) || $device->fiscal_device_id === '') {
            throw new RuntimeException('Missing Fiscal Cloud device id.');
        }

        $company = $device->company()->first();
        if (! $company) {
            throw new RuntimeException('Missing company for device.');
        }

        $device->forceFill([
            'activation_status' => 'PROCESSING',
            'activation_error' => null,
            'activation_attempted_at' => now(),
        ])->save();

        try {
            // 1) Register with Docs AI to get ZIMRA device id + activation key
            $region = (string) ($company->region ?? data_get($company->fiscal_cloud_payload, 'company.region', ''));
            $station = (string) ($company->station ?? data_get($company->fiscal_cloud_payload, 'company.station', ''));
            $province = (string) ($company->province ?? data_get($company->fiscal_cloud_payload, 'company.province', ''));
            $city = (string) ($company->city ?? data_get($company->fiscal_cloud_payload, 'company.city', ''));
            $addressLine = (string) ($company->address_line ?? data_get($company->fiscal_cloud_payload, 'company.address', ''));
            $houseNo = (string) ($company->house_number ?? data_get($company->fiscal_cloud_payload, 'company.house_number', ''));

            $docsAiPayload = [
                'taxPayerName' => (string) ($company->legal_name ?? ''),
                'tradeName' => (string) ($company->trade_name ?? ''),
                'companyTin' => (string) ($company->tin ?? ''),
                'companyVat' => $company->vat_number !== null && $company->vat_number !== '' ? (string) $company->vat_number : null,
                'companyPhoneNumber' => (string) ($company->phone ?? ''),
                'companyEmail' => (string) ($company->email ?? ''),
                'houseNo' => $houseNo !== '' ? $houseNo : $this->extractHouseNo($company->address),
                'streetName' => $addressLine !== '' ? $addressLine : $this->extractStreet($company->address),
                'city' => $city !== '' ? $city : $this->extractCity($company->address),
                'province' => $province !== '' ? $province : $this->extractProvince($company->address),
                'region' => $region !== '' ? $region : null,
                'station' => $station !== '' ? $station : null,
                'deviceModel' => 'Server',
                'supplierId' => '2000093077',
                'serialNumber' => (string) ($device->device_serial_no ?: $device->fiscal_device_id),
            ];

            Log::info('DocsAI payload computed', [
                'company_device_id' => $device->id,
                'company_id' => $company->id,
                'region' => $docsAiPayload['region'],
                'station' => $docsAiPayload['station'],
                'serialNumber' => $docsAiPayload['serialNumber'],
            ]);

            $docsAiResponse = $docsAi->registerCompany($docsAiPayload);

            $zimraDeviceId = null;
            $zimraActivationKey = null;
            $values = $docsAiResponse['values'] ?? null;
            if (is_array($values) && isset($values[0], $values[1]) && is_scalar($values[0]) && is_scalar($values[1])) {
                $zimraDeviceId = (string) $values[0];
                $zimraActivationKey = (string) $values[1];
            }
            if ($zimraDeviceId === '' || $zimraActivationKey === '') {
                throw new RuntimeException('Unexpected Docs AI response structure (missing device id / activation key).');
            }

            $device->forceFill([
                'zimra_device_id' => $zimraDeviceId,
                'zimra_activation_key' => $zimraActivationKey,
                'zimra_environment' => $this->environment,
                'zimra_payload' => $docsAiResponse,
            ])->save();

            // 2) Activate in Fiscal Cloud
            $activationPayload = [
                'device_id' => $zimraDeviceId,
                'activation_key' => $zimraActivationKey,
                'environment' => $this->environment,
            ];
            $fiscalActivationResponse = $fiscalCloud->activateEInvoicingDevice($device->fiscal_device_id, $activationPayload);

            $device->forceFill([
                'fiscal_cloud_activated_at' => now(),
                'fiscal_cloud_activation_payload' => $fiscalActivationResponse,
                'activation_status' => 'ACTIVATED',
                'activation_error' => null,
            ])->save();

            SendZimraFdmsTemplateEmailJob::dispatch((string) $device->id);
        } catch (Throwable $e) {
            Log::error('Device activation job failed', [
                'company_device_id' => $device->id,
                'error' => $e->getMessage(),
            ]);

            $device->forceFill([
                'activation_status' => 'FAILED',
                'activation_error' => mb_substr($e->getMessage(), 0, 1000),
            ])->save();

            throw $e;
        }
    }

    private function extractHouseNo(?string $address): string
    {
        if (! is_string($address) || $address === '') {
            return '';
        }
        $parts = array_map('trim', explode(',', $address));

        return (string) ($parts[0] ?? '');
    }

    private function extractStreet(?string $address): string
    {
        if (! is_string($address) || $address === '') {
            return '';
        }
        $parts = array_map('trim', explode(',', $address));

        return (string) ($parts[1] ?? '');
    }

    private function extractCity(?string $address): string
    {
        if (! is_string($address) || $address === '') {
            return '';
        }
        $parts = array_map('trim', explode(',', $address));

        return (string) ($parts[2] ?? '');
    }

    private function extractProvince(?string $address): string
    {
        if (! is_string($address) || $address === '') {
            return '';
        }
        $parts = array_map('trim', explode(',', $address));

        return (string) ($parts[3] ?? '');
    }
}
