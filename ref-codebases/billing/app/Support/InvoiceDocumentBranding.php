<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\PaymentPlatform;
use App\Models\Invoice;

final class InvoiceDocumentBranding
{
    /**
     * @return array{
     *     logo_data_uri: string|null,
     *     issuer_name: string,
     *     issuer_lines: list<string>,
     *     payment_options: list<array{label: string, detail: string, logo_data_uri: string|null}>
     * }
     */
    public static function forInvoice(Invoice $invoice): array
    {
        $logoPath = config('billing.invoice.logo_path');
        $logoDataUri = is_string($logoPath) && $logoPath !== ''
            ? self::logoDataUriFromPublicPath($logoPath)
            : null;

        $issuerName = (string) config('billing.invoice.issuer_name', 'Axis');
        /** @var list<string> $issuerLines */
        $issuerLines = config('billing.invoice.issuer_details', []);
        if (! is_array($issuerLines)) {
            $issuerLines = [];
        }

        $paymentOptions = [];

        $cashDetail = (string) config('billing.invoice.payment_option_details.cash', '');
        $paymentOptions[] = [
            'label' => 'Cash',
            'detail' => self::substituteInvoiceId($cashDetail, $invoice),
            'logo_data_uri' => null,
        ];

        foreach (PaymentPlatform::cases() as $platform) {
            $key = $platform->value;
            $detail = (string) config('billing.invoice.payment_option_details.'.$key, '');
            $relative = ltrim($platform->logo(), '/');

            $paymentOptions[] = [
                'label' => $platform->label(),
                'detail' => self::substituteInvoiceId($detail, $invoice),
                'logo_data_uri' => self::logoDataUriFromPublicPath($relative),
            ];
        }

        return [
            'logo_data_uri' => $logoDataUri,
            'issuer_name' => $issuerName,
            'issuer_lines' => array_values(array_map(static fn (mixed $line): string => is_string($line) ? $line : (string) $line, $issuerLines)),
            'payment_options' => $paymentOptions,
        ];
    }

    public static function logoDataUriFromPublicPath(string $relativeToPublic): ?string
    {
        $relativeToPublic = ltrim($relativeToPublic, '/');
        if ($relativeToPublic === '') {
            return null;
        }

        $path = public_path($relativeToPublic);
        if (! is_file($path) || ! is_readable($path)) {
            return null;
        }

        $contents = @file_get_contents($path);
        if ($contents === false || $contents === '') {
            return null;
        }

        $mime = mime_content_type($path);
        if ($mime === false || $mime === '') {
            $mime = 'application/octet-stream';
        }

        return 'data:'.$mime.';base64,'.base64_encode($contents);
    }

    private static function substituteInvoiceId(string $detail, Invoice $invoice): string
    {
        return str_replace(':invoice_id', (string) $invoice->id, $detail);
    }
}
