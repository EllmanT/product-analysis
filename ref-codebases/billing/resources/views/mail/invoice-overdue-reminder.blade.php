<x-mail::message>
# Invoice reminder

Hello {{ $customerName }},

This is a reminder that **invoice #{{ $invoiceId }}** for **{{ $amount }} {{ $currency }}** was due on **{{ $dueDate }}** and is still outstanding.

Please arrange payment at your earliest convenience. If you have already paid, you can disregard this message.

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>
