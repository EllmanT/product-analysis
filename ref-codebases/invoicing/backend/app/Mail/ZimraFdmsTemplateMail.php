<?php

namespace App\Mail;

use App\Models\Company;
use App\Models\CompanyDevice;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class ZimraFdmsTemplateMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public CompanyDevice $device,
        public Company $company,
        public string $absoluteAttachmentPath,
        /** @var array<int, string> */
        public array $pdfAttachmentPaths = [],
    ) {}

    public function build(): self
    {
        $subject = sprintf(
            'ZIMRA FDMS Production registration - %s - Device %s',
            (string) ($this->company->trade_name ?? $this->company->legal_name ?? $this->company->id),
            (string) ($this->device->zimra_device_id ?? $this->device->id)
        );

        return $this
            ->subject($subject)
            ->text('mail.plain')
            ->attach($this->absoluteAttachmentPath, [
                'as' => 'FDMS Application for Production Template.xlsx',
                'mime' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ])
            ->tap(function (self $m) {
                foreach ($this->pdfAttachmentPaths as $path) {
                    if (is_string($path) && $path !== '' && is_file($path)) {
                        $m->attach($path, [
                            'mime' => 'application/pdf',
                        ]);
                    }
                }
            });
    }
}
