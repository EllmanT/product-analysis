<?php

namespace App\Services;

use App\Models\Invoice;
use Barryvdh\DomPDF\Facade\Pdf;
use Endroid\QrCode\Builder\Builder;
use Endroid\QrCode\Writer\PngWriter;
use Illuminate\Support\Facades\File;

class InvoicePdfService
{
    public function renderToStorage(Invoice $invoice, string $dir, string $filename): string
    {
        $invoice->loadMissing(['company', 'lines', 'taxes', 'fiscalResponse', 'device']);

        $relativeDir = $this->resolveTemplatesDir($dir);
        if (! File::exists($relativeDir)) {
            File::makeDirectory($relativeDir, 0755, true);
        }

        $qrDataUri = null;
        if ($invoice->fiscalResponse) {
            $qrPayload = (string) ($invoice->fiscalResponse->verification_link ?: $invoice->fiscalResponse->qr_code_url ?: '');
            if (trim($qrPayload) !== '') {
                $qrDataUri = $this->makeQrDataUri($qrPayload);
            }
        }

        $pdf = Pdf::loadView('pdf.invoice', [
            'invoice' => $invoice,
            'qrDataUri' => $qrDataUri,
        ])->setPaper('a4');

        $absolutePath = rtrim($relativeDir, '/').'/'.$filename;
        File::put($absolutePath, $pdf->output());

        return $absolutePath;
    }

    private function makeQrDataUri(string $payload): string
    {
        $result = Builder::create()
            ->writer(new PngWriter)
            ->data($payload)
            ->size(220)
            ->margin(0)
            ->build();

        return $result->getDataUri();
    }

    private function resolveTemplatesDir(string $dir): string
    {
        $p = trim($dir, '/');
        if (str_starts_with($p, 'templates/')) {
            $p = substr($p, strlen('templates/'));
        }

        return storage_path('app/templates/'.$p);
    }
}
