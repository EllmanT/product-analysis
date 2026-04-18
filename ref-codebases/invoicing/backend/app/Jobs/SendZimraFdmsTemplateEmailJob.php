<?php

namespace App\Jobs;

use App\Mail\ZimraFdmsTemplateMail;
use App\Models\CompanyDevice;
use App\Services\SampleFiscalizationService;
use App\Services\ZimraFdmsTemplateService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use RuntimeException;
use Throwable;

class SendZimraFdmsTemplateEmailJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 120;

    /** @var list<int> */
    public array $backoff = [10, 30, 60];

    public function __construct(public string $companyDeviceId) {}

    public function handle(ZimraFdmsTemplateService $templates, SampleFiscalizationService $samples): void
    {
        /** @var CompanyDevice|null $device */
        $device = CompanyDevice::query()->where('id', $this->companyDeviceId)->first();
        if (! $device) {
            return;
        }

        if ($device->zimra_fdms_template_emailed_at !== null) {
            return;
        }

        if ($device->fiscal_cloud_activated_at === null || mb_strtoupper((string) $device->activation_status) !== 'ACTIVATED') {
            throw new RuntimeException('Device is not activated yet.');
        }

        $company = $device->company()->first();
        if (! $company) {
            throw new RuntimeException('Missing company for device.');
        }

        if (! is_string($device->zimra_device_id) || $device->zimra_device_id === '' || ! is_string($device->zimra_activation_key) || $device->zimra_activation_key === '') {
            throw new RuntimeException('Missing ZIMRA device id / activation key.');
        }

        $to = (string) config('services.zimra.fdms_email_to', 'developers@axissol.com');
        if ($to === '') {
            throw new RuntimeException('Missing services.zimra.fdms_email_to configuration.');
        }

        try {
            $pdfPaths = [];
            $templatePdfPaths = null;

            if ($device->zimra_fdms_invoices_generated_at === null) {
                $generated = $samples->generateAndFiscalize($device, $company);
                $pdfPaths = [
                    $generated['invoiceUsdPdf'],
                    $generated['invoiceZwgPdf'],
                ];
                $templatePdfPaths = [
                    'invoiceUsd' => $generated['invoiceUsdPdf'],
                    'invoiceZwg' => $generated['invoiceZwgPdf'],
                ];

                $device->forceFill([
                    'zimra_fdms_invoices_generated_at' => now(),
                ])->save();
            } else {
                // Best effort: attach existing PDFs if present.
                $zimraDeviceId = (string) ($device->zimra_device_id ?? '');
                if ($zimraDeviceId !== '') {
                    $base = storage_path('app/templates/invoices/'.$zimraDeviceId);
                    $found = [];
                    foreach (['usd-receipt.pdf', 'zwg-receipt.pdf'] as $f) {
                        $p = $base.'/'.$f;
                        if (is_file($p)) {
                            $pdfPaths[] = $p;
                            $found[$f] = $p;
                        }
                    }
                    if (isset($found['usd-receipt.pdf'], $found['zwg-receipt.pdf'])) {
                        $templatePdfPaths = [
                            'invoiceUsd' => $found['usd-receipt.pdf'],
                            'invoiceZwg' => $found['zwg-receipt.pdf'],
                        ];
                    }
                }
            }

            $attachmentPath = $templates->generateFilledTemplate($device, $company, $templatePdfPaths);
            Mail::to($to)->send(new ZimraFdmsTemplateMail($device, $company, $attachmentPath, $pdfPaths));

            $device->forceFill([
                'zimra_fdms_template_emailed_at' => now(),
            ])->save();

            Log::info('Sent FDMS template email', [
                'company_device_id' => $device->id,
                'company_id' => $company->id,
                'to' => $to,
            ]);
        } catch (Throwable $e) {
            Log::error('Failed to send FDMS template email', [
                'company_device_id' => $device->id,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }
}
