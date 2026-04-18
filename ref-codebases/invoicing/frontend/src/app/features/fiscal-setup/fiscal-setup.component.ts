import { Component, PLATFORM_ID, inject, signal, computed } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ApiService } from '../../services/api.service';
import { REGIONS } from '../../utils/regions';
import { PROVINCES } from '../../utils/provinces';

type VatDocType = 'VAT_CERTIFICATE';

type DocProcessingResponse = {
  message: string;
  success: boolean;
  statusCode: number;
  data?: {
    docType?: string;
    regOperator?: string;
    regTradeName?: string;
    tinNumber?: string;
    vatNumber?: string;
  };
};

@Component({
  selector: 'app-fiscal-setup',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './fiscal-setup.component.html',
  styleUrl: './fiscal-setup.component.css',
})
export class FiscalSetupComponent {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private api = inject(ApiService);
  private router = inject(Router);
  private messages = inject(MessageService);

  step = signal<1 | 2 | 3 | 4 | 5>(1);

  vatRegistered = signal<boolean | null>(null);

  selectedFile = signal<File | null>(null);
  docProcessingLoading = signal(false);
  docProcessingError = signal<string | null>(null);
  docProcessingResult = signal<DocProcessingResponse | null>(null);

  taxpayerName = signal('');
  tradeName = signal('');
  vatNo = signal('');
  companyTin = signal('');

  region = signal<string | null>(null);
  station = signal<string | null>(null);

  phone = signal('');
  email = signal('');
  street = signal('');
  houseNo = signal('');
  province = signal<string | null>(null);
  city = signal<string | null>(null);

  regions = REGIONS;
  provinces = PROVINCES;

  regionStations = computed(() => {
    const r = this.region();
    const found = this.regions.find((x) => x.name === r);
    return found?.stations ?? [];
  });

  provinceCities = computed(() => {
    const p = this.province();
    const found = this.provinces.find((x) => x.name === p);
    return found?.cities ?? [];
  });

  requiredDocLabel = computed(() => {
    const vatReg = this.vatRegistered();
    if (vatReg === true) return 'VAT certificate';
    if (vatReg === false) return 'TIN certificate / Tax clearance';
    return 'document';
  });

  stepError = signal<string | null>(null);

  private setDocError(message: string) {
    this.docProcessingError.set(message);
    this.messages.add({ severity: 'error', summary: 'Document', detail: message });
  }

  private setStepError(message: string) {
    this.stepError.set(message);
    this.messages.add({ severity: 'error', summary: 'Validation', detail: message });
  }

  private clearStepError() {
    this.stepError.set(null);
  }

  onlyDigits(value: string): string {
    return String(value ?? '').replace(/\D+/g, '');
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  private isPositiveInt(value: string): boolean {
    return /^[1-9]\d*$/.test(value.trim());
  }

  private isDigitsLength(value: string, len: number): boolean {
    return new RegExp(`^\\d{${len}}$`).test(value.trim());
  }

  onVatRegisteredChange(value: boolean) {
    this.vatRegistered.set(value);
    // reset downstream state
    this.selectedFile.set(null);
    this.docProcessingResult.set(null);
    this.docProcessingError.set(null);
    this.clearStepError();
    this.taxpayerName.set('');
    this.tradeName.set('');
    this.vatNo.set('');
    this.companyTin.set('');
  }

  nextFromStep1() {
    this.clearStepError();
    if (this.vatRegistered() === null) {
      this.setStepError('Select VAT registered or non-VAT.');
      return;
    }
    this.step.set(2);
  }

  back() {
    const s = this.step();
    if (s > 1) this.step.set((s - 1) as any);
  }

  onFilePicked(file: File | null) {
    this.selectedFile.set(file);
    this.docProcessingResult.set(null);
    this.docProcessingError.set(null);
    this.clearStepError();
  }

  async handleFileInput(evt: Event) {
    const input = evt.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    this.onFilePicked(file);
    if (input) input.value = '';
  }

  processDocument() {
    if (!this.isBrowser) return;
    this.clearStepError();
    const vatReg = this.vatRegistered();
    const file = this.selectedFile();
    if (vatReg === null) {
      this.setDocError('Choose VAT registered or non-VAT first.');
      return;
    }
    if (!file) {
      this.setDocError(`Upload your ${this.requiredDocLabel()}.`);
      return;
    }

    this.docProcessingLoading.set(true);
    this.docProcessingError.set(null);

    this.api.processVatDocument(file).subscribe({
      next: (res) => {
        this.docProcessingLoading.set(false);
        this.docProcessingResult.set(res);
        if (!res?.success) {
          this.setDocError(res?.message ?? 'Document validation failed.');
          return;
        }
        const docType = String(res.data?.docType ?? '');
        if (vatReg === true && docType !== ('VAT_CERTIFICATE' as VatDocType)) {
          this.setDocError('This is not a VAT certificate. Please upload the VAT certificate document.');
          return;
        }

        // Populate taxpayer fields from response
        this.taxpayerName.set(String(res.data?.regOperator ?? ''));
        this.tradeName.set(String(res.data?.regTradeName ?? ''));
        this.companyTin.set(String(res.data?.tinNumber ?? ''));
        this.vatNo.set(String(res.data?.vatNumber ?? ''));

        if (!this.isDigitsLength(this.companyTin(), 10)) {
          this.setDocError('TIN must be exactly 10 digits. Please upload a clearer document.');
          return;
        }
        if (vatReg === true) {
          if (!this.isDigitsLength(this.vatNo(), 9)) {
            this.setDocError('VAT number must be exactly 9 digits. Please upload a clearer VAT certificate.');
            return;
          }
        }

        if (!this.taxpayerName().trim() || !this.tradeName().trim()) {
          this.setDocError('Could not detect taxpayer name/trade name. Please upload a clearer document.');
          return;
        }

        this.step.set(3);
      },
      error: (err) => {
        this.docProcessingLoading.set(false);
        this.setDocError(err?.error?.message ?? 'Document validation failed.');
      },
    });
  }

  onRegionChange(value: string | null) {
    this.region.set(value);
    this.station.set(null);
  }

  onProvinceChange(value: string | null) {
    this.province.set(value);
    this.city.set(null);
  }

  nextFromStep3() {
    this.clearStepError();
    if (!this.taxpayerName().trim()) {
      this.setStepError('Taxpayer Name is required.');
      return;
    }
    if (!this.tradeName().trim()) {
      this.setStepError('Trade Name is required.');
      return;
    }
    if (!this.isDigitsLength(this.companyTin(), 10)) {
      this.setStepError('Company TIN must be exactly 10 digits.');
      return;
    }
    if (this.vatRegistered() === true && !this.vatNo().trim()) {
      this.setStepError('VAT number is required for VAT registered.');
      return;
    }
    if (this.vatRegistered() === true && !this.isDigitsLength(this.vatNo(), 9)) {
      this.setStepError('VAT number must be exactly 9 digits.');
      return;
    }
    if (!this.region() || !this.station()) {
      this.setStepError('Select your region and station.');
      return;
    }
    this.step.set(4);
  }

  nextFromStep4() {
    this.clearStepError();
    const phoneDigits = this.onlyDigits(this.phone());
    if (phoneDigits.length < 8) {
      this.setStepError('Company phone number must be at least 8 digits.');
      return;
    }
    if (!this.isValidEmail(this.email())) {
      this.setStepError('Enter a valid company email address.');
      return;
    }
    if (!this.street().trim()) {
      this.setStepError('Street Name & Suburb is required.');
      return;
    }
    if (!this.isPositiveInt(this.houseNo())) {
      this.setStepError('House No must be digits only and greater than zero.');
      return;
    }
    if (!this.province() || !this.city()) {
      this.setStepError('Select province and city.');
      return;
    }
    this.step.set(5);
  }

  confirmLoading = signal(false);

  confirmAndSubmit() {
    this.clearStepError();
    const file = this.selectedFile();
    if (!file) {
      this.messages.add({ severity: 'error', summary: 'Document', detail: 'Missing uploaded document.' });
      this.step.set(2);
      return;
    }
    if (this.vatRegistered() === null) {
      this.messages.add({ severity: 'error', summary: 'VAT status', detail: 'Select VAT registered or non-VAT.' });
      this.step.set(1);
      return;
    }
    if (!this.taxpayerName().trim() || !this.tradeName().trim()) {
      this.messages.add({ severity: 'error', summary: 'Taxpayer', detail: 'Taxpayer Name and Trade Name are required.' });
      this.step.set(3);
      return;
    }
    if (!this.isDigitsLength(this.companyTin(), 10)) {
      this.messages.add({ severity: 'error', summary: 'TIN', detail: 'Company TIN must be exactly 10 digits.' });
      this.step.set(3);
      return;
    }
    if (this.vatRegistered() === true && !this.isDigitsLength(this.vatNo(), 9)) {
      this.messages.add({ severity: 'error', summary: 'VAT', detail: 'VAT number must be exactly 9 digits.' });
      this.step.set(3);
      return;
    }
    if (!this.region() || !this.station()) {
      this.messages.add({ severity: 'error', summary: 'Region', detail: 'Missing region/station.' });
      this.step.set(3);
      return;
    }
    if (!this.province() || !this.city()) {
      this.messages.add({ severity: 'error', summary: 'Address', detail: 'Missing province/city.' });
      this.step.set(4);
      return;
    }
    const phoneDigits = this.onlyDigits(this.phone());
    if (phoneDigits.length < 8) {
      this.messages.add({ severity: 'error', summary: 'Phone', detail: 'Company phone number must be at least 8 digits.' });
      this.step.set(4);
      return;
    }
    if (!this.isValidEmail(this.email())) {
      this.messages.add({ severity: 'error', summary: 'Email', detail: 'Enter a valid company email address.' });
      this.step.set(4);
      return;
    }
    if (!this.street().trim() || !this.isPositiveInt(this.houseNo())) {
      this.messages.add({ severity: 'error', summary: 'Address', detail: 'Street/Suburb is required and House No must be > 0.' });
      this.step.set(4);
      return;
    }

    const payload = {
      vat_registered: this.vatRegistered() === true,
      name: this.taxpayerName().trim(),
      trade_name: this.tradeName().trim(),
      tin: this.companyTin().trim(),
      vat: this.vatNo().trim() || undefined,
      region: this.region()!,
      station: this.station()!,
      province: this.province()!,
      city: this.city()!,
      address: this.street().trim(),
      house_number: this.houseNo().trim(),
      company_phone: phoneDigits,
      company_email: this.email().trim(),
    };

    this.confirmLoading.set(true);
    this.api.applyFiscalization(payload, file).subscribe({
      next: (res) => {
        this.confirmLoading.set(false);
        if (!res.success) {
          this.messages.add({ severity: 'error', summary: 'Submission failed', detail: res.message ?? 'Request failed.' });
          return;
        }
        this.messages.add({ severity: 'success', summary: 'Submitted', detail: 'Company and device created. Activation is processing.' });
        void this.router.navigate(['/company']);
      },
      error: (err) => {
        this.confirmLoading.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'Submission failed',
          detail: err?.error?.message ?? 'Request failed.',
        });
      },
    });
  }
}
