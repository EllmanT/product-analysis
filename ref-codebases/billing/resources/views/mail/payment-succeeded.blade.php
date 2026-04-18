<x-mail::message>
# Payment received

A payment was successfully recorded in {{ config('app.name') }}.

**Invoice:** #{{ $invoiceId }}  
**Customer:** {{ $customerName }}  
**Team:** {{ $teamName }}

---

**Amount (USD settled):** {{ $amountUsd }}

**Invoice total:** {{ $invoiceAmount }} {{ $invoiceCurrency }}

@if($originalLine)
**Original / FX:** {{ $originalLine }}
@endif

**Payment method:** {{ $paymentMethod }}

**Transaction reference:** {{ $transactionReference }}

**Payment ID:** {{ $paymentId }}

**Recorded at:** {{ $recordedAt }}

---

<x-mail::button :url="url('/invoices/'.$invoiceId)">
View invoice
</x-mail::button>

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>
