<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: DejaVu Sans, sans-serif; font-size: 12px; color: #111; }
        .row { display: flex; justify-content: space-between; }
        h1 { font-size: 16px; margin: 0 0 8px 0; }
        h2 { font-size: 13px; margin: 16px 0 6px 0; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 6px; vertical-align: top; }
        th { background: #f5f5f5; text-align: left; }
        .right { text-align: right; }
        .muted { color: #666; }
        .mb8 { margin-bottom: 8px; }
    </style>
</head>
<body>
    <div class="row mb8">
        <div>
            <h1>{{ $invoice->receipt_type }} · {{ $invoice->receipt_print_form }}</h1>
            <div class="muted">Invoice No: {{ $invoice->invoice_no }}</div>
            <div class="muted">Date: {{ optional($invoice->receipt_date)->format('Y-m-d H:i:s') }}</div>
            <div class="muted">Currency: {{ $invoice->receipt_currency }}</div>
        </div>
        <div style="text-align: right;">
            <div><strong>{{ $invoice->company->legal_name ?? '' }}</strong></div>
            <div class="muted">{{ $invoice->company->trade_name ?? '' }}</div>
            <div class="muted">TIN: {{ $invoice->company->tin ?? '' }}</div>
            <div class="muted">{{ $invoice->company->email ?? '' }}</div>
        </div>
    </div>

    @if($invoice->fiscalResponse)
        <h2>Fiscalization</h2>
        <div class="row mb8" style="align-items: flex-start;">
            <div class="muted" style="flex: 1;">
                Verification code: {{ $invoice->fiscalResponse->verification_code ?? '' }}<br>
                Verification link: {{ $invoice->fiscalResponse->verification_link ?? '' }}<br>
                FDMS invoice no: {{ $invoice->fiscalResponse->fdms_invoice_no ?? '' }}<br>
            </div>
            @if(!empty($qrDataUri))
                <div style="width: 120px; text-align: right;">
                    <img src="{{ $qrDataUri }}" alt="QR" style="width: 110px; height: 110px;">
                </div>
            @endif
        </div>
    @endif

    <h2>Line items</h2>
    <table>
        <thead>
        <tr>
            <th style="width: 36px;">#</th>
            <th>Description</th>
            <th style="width: 70px;" class="right">Qty</th>
            <th style="width: 90px;" class="right">Unit</th>
            <th style="width: 90px;" class="right">Tax</th>
            <th style="width: 110px;" class="right">Total</th>
        </tr>
        </thead>
        <tbody>
        @foreach(($invoice->lines ?? []) as $line)
            <tr>
                <td>{{ $line->line_no }}</td>
                <td>
                    {{ $line->description }}
                    @if($line->hs_code)
                        <div class="muted">HS: {{ $line->hs_code }}</div>
                    @endif
                </td>
                <td class="right">{{ number_format((float) $line->quantity, 2, '.', ',') }}</td>
                <td class="right">{{ number_format((float) $line->unit_price, 2, '.', ',') }}</td>
                <td class="right">{{ $line->tax_code }} ({{ number_format((float) $line->tax_percent, 2, '.', ',') }}%)</td>
                <td class="right">{{ number_format((float) $line->line_total_incl, 2, '.', ',') }}</td>
            </tr>
        @endforeach
        </tbody>
    </table>

    <h2>Totals</h2>
    <table>
        <tbody>
        <tr>
            <td>Total excl. tax</td>
            <td class="right">{{ number_format((float) ($invoice->total_excl_tax ?? 0), 2, '.', ',') }}</td>
        </tr>
        <tr>
            <td>Total VAT</td>
            <td class="right">{{ number_format((float) ($invoice->total_vat ?? 0), 2, '.', ',') }}</td>
        </tr>
        <tr>
            <td><strong>Receipt total</strong></td>
            <td class="right"><strong>{{ number_format((float) ($invoice->receipt_total ?? 0), 2, '.', ',') }}</strong></td>
        </tr>
        </tbody>
    </table>
</body>
</html>

