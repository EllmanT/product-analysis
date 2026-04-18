<?php

namespace App\Services;

use App\Models\Company;
use App\Models\CompanyDevice;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use RuntimeException;
use ZipArchive;

class ZimraFdmsTemplateService
{
    /**
     * @param  array{invoiceUsd?:string,invoiceZwg?:string}|null  $pdfPaths
     */
    public function generateFilledTemplate(CompanyDevice $device, Company $company, ?array $pdfPaths = null): string
    {
        $templatePath = (string) config('services.zimra.fdms_template_path');
        if ($templatePath !== '' && ! str_starts_with($templatePath, '/')) {
            $templatePath = base_path($templatePath);
        }
        if ($templatePath === '' || ! is_file($templatePath)) {
            throw new RuntimeException('FDMS template file not found. Configure ZIMRA_FDMS_TEMPLATE_PATH.');
        }

        $spreadsheet = IOFactory::load($templatePath);
        $sheet = $spreadsheet->getSheet(0);

        $highestRow = max(2, (int) $sheet->getHighestDataRow());
        for ($row = 2; $row <= $highestRow; $row++) {
            $sheet->fromArray(array_fill(0, 21, null), null, 'A'.$row);
        }

        $serialNo = (string) ($device->device_serial_no ?: $device->fiscal_device_id);

        $sheet->setCellValue('A2', 1);
        $sheet->setCellValue('B2', (string) ($company->tin ?? ''));
        $sheet->setCellValue('C2', (string) ($company->legal_name ?? ''));
        $sheet->setCellValue('D2', (string) ($company->vat_number ?? ''));
        $sheet->setCellValue('E2', (string) ($company->trade_name ?? ''));
        $sheet->setCellValue('F2', (string) ($company->phone ?? ''));
        $sheet->setCellValue('G2', (string) ($company->email ?? ''));
        $sheet->setCellValue('H2', (string) ($company->province ?? ''));
        $sheet->setCellValue('I2', (string) ($company->address_line ?? $company->address ?? ''));
        $sheet->setCellValue('J2', (string) ($company->house_number ?? ''));
        $sheet->setCellValue('K2', (string) ($company->city ?? ''));

        // Serial No appears twice in the template (columns L and O).
        $sheet->setCellValue('L2', $serialNo);
        $sheet->setCellValue('M2', 'Server');
        $sheet->setCellValue('N2', 'V1');
        $sheet->setCellValue('O2', $serialNo);

        $sheet->setCellValue('P2', (string) ($device->zimra_device_id ?? ''));
        $sheet->setCellValue('Q2', (string) ($device->zimra_activation_key ?? ''));

        // The template already contains embedded OLE objects (PDF packages) in these columns.
        // Keep cells blank; we will swap the embedded PDF payloads in the generated file.
        $sheet->setCellValue('R2', '');
        $sheet->setCellValue('S2', '');
        $sheet->setCellValue('T2', '');
        $sheet->setCellValue('U2', '');

        $outDir = 'zimra/fdms-templates';
        Storage::disk('local')->makeDirectory($outDir);

        $filename = sprintf(
            'FDMS-Production-%s-%s.xlsx',
            (string) $device->id,
            now()->format('Ymd-His')
        );

        $relativePath = $outDir.'/'.$filename;
        $absolutePath = Storage::disk('local')->path($relativePath);

        $writer = new Xlsx($spreadsheet);
        $writer->save($absolutePath);

        // Replace embedded invoice PDFs in the template's existing OLE packages.
        if (is_array($pdfPaths)) {
            $usdPdf = (string) ($pdfPaths['invoiceUsd'] ?? '');
            $zwgPdf = (string) ($pdfPaths['invoiceZwg'] ?? '');
            if ($usdPdf !== '' && $zwgPdf !== '' && is_file($usdPdf) && is_file($zwgPdf)) {
                $this->embedInvoicePdfsIntoTemplate($absolutePath, $usdPdf, $zwgPdf);
            }
        }

        Log::info('Generated FDMS template', [
            'company_device_id' => $device->id,
            'company_id' => $company->id,
            'path' => $relativePath,
        ]);

        return $absolutePath;
    }

    private function embedInvoicePdfsIntoTemplate(string $xlsxAbsolutePath, string $usdPdfAbsolutePath, string $zwgPdfAbsolutePath): void
    {
        $zip = new ZipArchive;
        if ($zip->open($xlsxAbsolutePath) !== true) {
            throw new RuntimeException('Failed to open generated FDMS template for embedding.');
        }

        try {
            $this->replaceEmbeddedPdfInOlePackage($zip, 'xl/embeddings/oleObject1.bin', $usdPdfAbsolutePath, [
                // keep the label consistent if template uses it
                ['from' => 'USD Receipt.pdf', 'to' => 'USD Receipt.pdf'],
            ]);

            $this->replaceEmbeddedPdfInOlePackage($zip, 'xl/embeddings/oleObject2.bin', $zwgPdfAbsolutePath, [
                // Template uses ZWL; we use ZWG but keep same-length string
                ['from' => 'ZWL Receipt.pdf', 'to' => 'ZWG Receipt.pdf'],
                ['from' => 'ZWL Receipt', 'to' => 'ZWG Receipt'],
            ]);
        } finally {
            $zip->close();
        }
    }

    /**
     * Replace the embedded PDF bytes inside an OLE "Package" container.
     *
     * The template already contains an embedded PDF in the OLE package; we overwrite the PDF
     * byte-range in-place and pad with NUL bytes so the OLE sector structure remains unchanged.
     *
     * @param  array<int, array{from:string,to:string}>  $stringReplacements
     */
    private function replaceEmbeddedPdfInOlePackage(ZipArchive $zip, string $olePath, string $pdfPath, array $stringReplacements = []): void
    {
        $ole = $zip->getFromName($olePath);
        if (! is_string($ole) || $ole === '') {
            throw new RuntimeException("Missing OLE object '{$olePath}' in FDMS template.");
        }

        $pdf = file_get_contents($pdfPath);
        if (! is_string($pdf) || $pdf === '') {
            throw new RuntimeException("Failed to read PDF '{$pdfPath}'.");
        }

        foreach ($stringReplacements as $r) {
            if (isset($r['from'], $r['to']) && strlen($r['from']) === strlen($r['to'])) {
                $ole = str_replace($r['from'], $r['to'], $ole);
            }
        }

        $start = strpos($ole, '%PDF-');
        $eof = strrpos($ole, '%%EOF');
        if ($start === false || $eof === false) {
            throw new RuntimeException("OLE object '{$olePath}' does not contain a PDF placeholder.");
        }
        $end = $eof + strlen('%%EOF');
        $placeholderLen = $end - $start;

        if (strlen($pdf) > $placeholderLen) {
            throw new RuntimeException("Generated PDF is too large to embed into '{$olePath}' placeholder.");
        }

        $replacement = $pdf.str_repeat("\0", $placeholderLen - strlen($pdf));
        $ole = substr($ole, 0, $start).$replacement.substr($ole, $end);

        $zip->addFromString($olePath, $ole);
    }
}
