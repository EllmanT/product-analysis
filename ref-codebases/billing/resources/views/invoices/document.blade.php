<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Invoice #{{ $invoice->id }} — {{ $branding['issuer_name'] }}</title>
    <style>
        :root {
            --ink: #1a1d26;
            --muted: #5c6478;
            --line: #e2e6ef;
            --accent: #c00000;
            --accent-soft: #fff0f0;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 48px 40px 56px;
            font-family: DejaVu Sans, sans-serif;
            font-size: 13px;
            line-height: 1.45;
            color: var(--ink);
            background: #f6f7fb;
        }
        .sheet {
            max-width: 800px;
            margin: 0 auto;
            background: #fff;
            border-radius: 2px;
            box-shadow: 0 1px 0 rgba(15, 23, 42, 0.06), 0 12px 40px rgba(15, 23, 42, 0.08);
            border: 1px solid var(--line);
            overflow: hidden;
        }
        .accent-bar {
            height: 4px;
            background: var(--accent);
        }
        .inner { padding: 36px 40px 40px; }
        .top {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 28px;
        }
        .top td { vertical-align: top; padding: 0; }
        .brand-row { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .brand-row td { vertical-align: top; padding: 0; }
        .brand-mark { width: 220px; padding-right: 18px; vertical-align: middle; }
        .logo-img {
            display: block;
            width: auto;
            height: auto;
            max-width: 220px;
            max-height: 72px;
            object-fit: contain;
        }
        .axis-name {
            font-size: 20px;
            font-weight: 700;
            letter-spacing: -0.02em;
            color: var(--ink);
            margin: 0 0 6px;
        }
        .axis-line {
            margin: 0 0 3px;
            font-size: 12px;
            color: var(--muted);
            line-height: 1.4;
        }
        .brand {
            font-size: 11px;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--accent);
            font-weight: 700;
            margin-bottom: 6px;
        }
        .title {
            font-size: 26px;
            font-weight: 700;
            letter-spacing: -0.02em;
            margin: 0 0 4px;
        }
        .subtitle { color: var(--muted); font-size: 12px; margin: 0; }
        .meta {
            text-align: right;
            font-size: 12px;
        }
        .meta table { margin-left: auto; border-collapse: collapse; }
        .meta td { padding: 2px 0 2px 16px; white-space: nowrap; }
        .meta td:first-child { color: var(--muted); padding-left: 0; text-align: right; }
        .meta td:last-child { font-weight: 600; text-align: right; }
        .pill {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            background: var(--accent-soft);
            color: var(--accent);
        }
        .columns {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 28px;
        }
        .columns td {
            width: 50%;
            vertical-align: top;
            padding: 16px 20px;
            border: 1px solid var(--line);
            background: #fafbfe;
        }
        .columns td:first-child { border-right: none; }
        .columns h3 {
            margin: 0 0 10px;
            font-size: 11px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: var(--muted);
            font-weight: 700;
        }
        .columns p { margin: 0 0 4px; }
        .lines {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
        }
        .lines thead th {
            text-align: left;
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--muted);
            font-weight: 700;
            padding: 10px 12px;
            border-bottom: 2px solid var(--line);
            background: #f8fafc;
        }
        .lines thead th:nth-child(2),
        .lines thead th:nth-child(3),
        .lines thead th:nth-child(4) { text-align: right; }
        .lines tbody td {
            padding: 12px;
            border-bottom: 1px solid var(--line);
            vertical-align: top;
        }
        .lines tbody td:nth-child(2),
        .lines tbody td:nth-child(3),
        .lines tbody td:nth-child(4) { text-align: right; white-space: nowrap; }
        .lines tbody tr:last-child td { border-bottom: none; }
        .desc { max-width: 360px; }
        .totals {
            width: 100%;
            max-width: 320px;
            margin-left: auto;
            border-collapse: collapse;
        }
        .totals td { padding: 8px 12px; font-size: 13px; }
        .totals td:first-child { color: var(--muted); text-align: right; }
        .totals td:last-child { text-align: right; font-weight: 600; white-space: nowrap; }
        .totals tr.grand td {
            padding-top: 14px;
            font-size: 16px;
            font-weight: 700;
            border-top: 2px solid var(--line);
        }
        .foot {
            margin-top: 32px;
            padding-top: 20px;
            border-top: 1px dashed var(--line);
            font-size: 11px;
            color: var(--muted);
            text-align: center;
        }
        .pay-section {
            margin-top: 28px;
            padding: 18px 20px;
            border: 1px solid var(--line);
            background: #fafbfe;
            border-radius: 2px;
        }
        .pay-section h3 {
            margin: 0 0 14px;
            font-size: 11px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: var(--muted);
            font-weight: 700;
        }
        .pay-table { width: 100%; border-collapse: collapse; }
        .pay-table td {
            padding: 10px 0;
            border-bottom: 1px solid var(--line);
            vertical-align: top;
        }
        .pay-table tr:last-child td { border-bottom: none; }
        .pay-icon {
            width: 36px;
            padding-right: 10px;
        }
        .pay-icon img {
            display: block;
            width: 28px;
            height: 28px;
            max-width: 28px;
            max-height: 28px;
            object-fit: contain;
        }
        .pay-label {
            font-weight: 700;
            font-size: 13px;
            margin: 0 0 4px;
        }
        .pay-detail {
            margin: 0;
            font-size: 12px;
            color: var(--muted);
            line-height: 1.45;
        }
        @media print {
            body { background: #fff; padding: 0; }
            .sheet { box-shadow: none; border: none; max-width: none; }
        }
    </style>
</head>
<body>
@php
    $currency = strtoupper((string) $invoice->currency);
    $fmt = static function (string|float $amount) use ($currency): string {
        return $currency.' '.number_format((float) $amount, 2, '.', ',');
    };
    $statusLabel = str($invoice->status->value)->replace('_', ' ')->title()->toString();
    $merchantName = $invoice->team?->name ?? config('app.name');
    $issued = $invoice->created_at?->timezone(config('app.timezone'))->format('M j, Y') ?? '—';
    $due = $invoice->due_date?->format('M j, Y') ?? '—';
@endphp

<div class="sheet">
    <div class="accent-bar"></div>
    <div class="inner">
        <table class="brand-row">
            <tr>
                <td class="brand-mark">
                    @if (! empty($branding['logo_data_uri']))
                        <img class="logo-img" src="{{ $branding['logo_data_uri'] }}" alt="{{ $branding['issuer_name'] }}">
                    @endif
                </td>
                <td>
                    <p class="axis-name">{{ $branding['issuer_name'] }}</p>
                    @foreach ($branding['issuer_lines'] as $line)
                        <p class="axis-line">{{ $line }}</p>
                    @endforeach
                </td>
            </tr>
        </table>

        <table class="top">
            <tr>
                <td>
                    <div class="brand">{{ $merchantName }}</div>
                    <h1 class="title">Invoice</h1>
                    <p class="subtitle">Reference #{{ $invoice->id }}</p>
                </td>
                <td class="meta">
                    <table>
                        <tr>
                            <td>Status</td>
                            <td><span class="pill">{{ $statusLabel }}</span></td>
                        </tr>
                        <tr>
                            <td>Issued</td>
                            <td>{{ $issued }}</td>
                        </tr>
                        <tr>
                            <td>Due</td>
                            <td>{{ $due }}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <table class="columns">
            <tr>
                <td>
                    <h3>From</h3>
                    <p><strong>{{ $merchantName }}</strong></p>
                    <p style="color: var(--muted); font-size: 12px;">Invoice issued via {{ $branding['issuer_name'] }} · {{ config('app.name') }}</p>
                </td>
                <td>
                    <h3>Bill to</h3>
                    <p><strong>{{ $invoice->customer?->name ?? 'Customer' }}</strong></p>
                    @if ($invoice->customer?->email)
                        <p style="color: var(--muted);">{{ $invoice->customer->email }}</p>
                    @endif
                    @if ($invoice->subscription?->plan)
                        @php
                            $plan = $invoice->subscription->plan;
                            $product = $plan->relationLoaded('product') ? $plan->product : null;
                            $planLine = $product
                                ? $product->name.' — '.$plan->name
                                : $plan->name;
                        @endphp
                        <p style="margin-top: 8px; font-size: 12px; color: var(--muted);">Subscription: {{ $planLine }}</p>
                    @endif
                </td>
            </tr>
        </table>

        <table class="lines">
            <thead>
                <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Amount</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($lines as $row)
                    @php
                        $isModel = is_object($row) && isset($row->description);
                        $desc = $isModel ? $row->description : ($row['description'] ?? '');
                        $qty = $isModel ? (int) $row->quantity : (int) ($row['quantity'] ?? 0);
                        $unit = $isModel ? (string) $row->unit_price : (string) ($row['unit_price'] ?? '0');
                        $lineTotal = $isModel ? (string) $row->total : (string) ($row['total'] ?? '0');
                    @endphp
                    <tr>
                        <td class="desc">{{ $desc }}</td>
                        <td>{{ $qty }}</td>
                        <td>{{ $fmt($unit) }}</td>
                        <td>{{ $fmt($lineTotal) }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>

        <table class="totals">
            <tr class="grand">
                <td>Total due</td>
                <td>{{ $fmt($invoice->amount) }}</td>
            </tr>
        </table>

        <div class="pay-section">
            <h3>Payment options</h3>
            <table class="pay-table">
                @foreach ($branding['payment_options'] as $opt)
                    <tr>
                        <td class="pay-icon">
                            @if (! empty($opt['logo_data_uri']))
                                <img src="{{ $opt['logo_data_uri'] }}" alt="">
                            @endif
                        </td>
                        <td>
                            <p class="pay-label">{{ $opt['label'] }}</p>
                            <p class="pay-detail">{{ $opt['detail'] }}</p>
                        </td>
                    </tr>
                @endforeach
            </table>
        </div>

        <div class="foot">
            Thank you for your business. Please include invoice #{{ $invoice->id }} with your payment.
        </div>
    </div>
</div>
</body>
</html>
