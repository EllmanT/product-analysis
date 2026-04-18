import { Component, signal, computed, inject, effect, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { InputMaskModule } from 'primeng/inputmask';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { Country, City } from 'country-state-city';
import { ApiService } from '../../services/api.service';
import { AuthTokenService } from '../../services/auth-token.service';

interface CompanyDetails {
  companyName: string;
  registrationNumber: string;
  taxId: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  postalCode: string;
}

interface AdminUser {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  passwordConfirmation: string;
}

interface CountryOption {
  name: string;
  code: string;
}

interface CityOption {
  name: string;
}

@Component({
  selector: 'app-company-setup',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    InputMaskModule,
    TextareaModule,
    SelectModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './company-setup.component.html',
  styleUrl: './company-setup.component.css',
})
export class CompanySetupComponent implements OnInit {
  private router = inject(Router);
  private messageService = inject(MessageService);
  private api = inject(ApiService);
  private tokens = inject(AuthTokenService);
  private platformId = inject(PLATFORM_ID);

  /** User already has an account (e.g. signed up on /signup); skip password fields. */
  isLoggedIn = signal(false);

  currentStep = signal(1);
  saving = signal(false);

  // Country and City data
  countries = signal<CountryOption[]>([]);
  cities = signal<CityOption[]>([]);
  selectedCountry = signal<CountryOption | null>(null);
  selectedCity = signal<CityOption | null>(null);

  // Use separate signals for each field to enable two-way binding
  companyName = signal('');
  registrationNumber = signal('');
  taxId = signal('');
  email = signal('');
  phone = signal('');
  address = signal('');
  postalCode = signal('');

  // Computed company details from individual fields
  companyDetails = computed<CompanyDetails>(() => ({
    companyName: this.companyName(),
    registrationNumber: this.registrationNumber(),
    taxId: this.taxId(),
    email: this.email(),
    phone: this.phone(),
    address: this.address(),
    city: this.selectedCity()?.name || '',
    country: this.selectedCountry()?.name || '',
    postalCode: this.postalCode(),
  }));

  // Admin user fields as separate signals
  adminFirstName = signal('');
  adminLastName = signal('');
  adminEmail = signal('');
  adminPhone = signal('');
  adminPassword = signal('');
  adminPasswordConfirmation = signal('');

  // Computed admin user from individual fields
  adminUser = computed<AdminUser>(() => ({
    firstName: this.adminFirstName(),
    lastName: this.adminLastName(),
    email: this.adminEmail(),
    phone: this.adminPhone(),
    password: this.adminPassword(),
    passwordConfirmation: this.adminPasswordConfirmation(),
  }));

  constructor() {
    // Load all countries
    this.loadCountries();

    // Watch for country changes and load cities
    effect(() => {
      const country = this.selectedCountry();
      if (country) {
        this.loadCities(country.code);
        this.selectedCity.set(null); // Reset selected city when country changes
      } else {
        this.cities.set([]);
      }
    });
  }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId) || !this.tokens.hasToken()) {
      return;
    }
    this.api.getAuthSession().subscribe({
      next: (res) => {
        const u = res.user;
        if (!u?.email) {
          return;
        }
        this.adminFirstName.set(String(u.first_name ?? '').trim());
        this.adminLastName.set(String(u.last_name ?? '').trim());
        this.adminEmail.set(String(u.email ?? '').trim().toLowerCase());
        if (u.phone) {
          this.adminPhone.set(String(u.phone));
        }
        this.isLoggedIn.set(true);
      },
      error: () => undefined,
    });
  }

  private loadCountries(): void {
    const allCountries = Country.getAllCountries();
    this.countries.set(
      allCountries.map(country => ({
        name: country.name,
        code: country.isoCode,
      })).sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  private loadCities(countryCode: string): void {
    const citiesData = City.getCitiesOfCountry(countryCode);
    if (citiesData && citiesData.length > 0) {
      this.cities.set(
        citiesData.map(city => ({
          name: city.name,
        })).sort((a, b) => a.name.localeCompare(b.name))
      );
    } else {
      this.cities.set([]);
    }
  }

  // Validation
  isStep1Valid = computed(() => {
    const company = this.companyDetails();
    return !!(
      company.companyName &&
      company.registrationNumber &&
      company.email &&
      company.phone &&
      company.country &&
      company.city
    );
  });

  isStep2Valid = computed(() => {
    const admin = this.adminUser();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email.trim());
    const base = !!(admin.firstName && admin.lastName && admin.phone && emailOk);
    if (this.isLoggedIn()) {
      return base;
    }
    const pwdOk =
      admin.password.length >= 8 && admin.password === admin.passwordConfirmation;
    return base && pwdOk;
  });

  nextStep(): void {
    if (this.currentStep() < 3) {
      this.currentStep.set(this.currentStep() + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  prevStep(): void {
    if (this.currentStep() > 1) {
      this.currentStep.set(this.currentStep() - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  onSubmit() {
    this.saving.set(true);
    const company = this.companyDetails();
    const admin = this.adminUser();

    if (this.isLoggedIn()) {
      this.api
        .completeNonFiscalizedCompanyProfile({
          company_name: company.companyName,
          registration_number: company.registrationNumber,
          tax_id: company.taxId || undefined,
          email: company.email,
          phone: company.phone,
          physical_address: company.address || undefined,
          city: company.city || undefined,
          country: company.country,
          postal_code: company.postalCode || undefined,
        })
        .subscribe({
          next: (res) => {
            this.saving.set(false);
            if (!res.success) {
              this.messageService.add({
                severity: 'error',
                summary: 'Registration failed',
                detail: res.message ?? 'Please check the form and try again.',
              });
              return;
            }
            this.messageService.add({
              severity: 'success',
              summary: 'Welcome',
              detail: 'Your company is ready.',
            });
            void this.router.navigate(['/dashboard']);
          },
          error: (err) => {
            this.saving.set(false);
            const msg = err?.error?.message ?? 'Registration failed.';
            this.messageService.add({ severity: 'error', summary: 'Error', detail: msg });
          },
        });
      return;
    }

    this.api
      .registerNonFiscalizedCompany({
        company_name: company.companyName,
        registration_number: company.registrationNumber,
        tax_id: company.taxId || undefined,
        email: company.email,
        phone: company.phone,
        physical_address: company.address || undefined,
        city: company.city || undefined,
        country: company.country,
        postal_code: company.postalCode || undefined,
        admin_first_name: admin.firstName,
        admin_last_name: admin.lastName,
        admin_email: admin.email.trim().toLowerCase(),
        admin_phone: admin.phone,
        admin_password: admin.password,
        admin_password_confirmation: admin.passwordConfirmation,
      })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          if (!res.success) {
            this.messageService.add({
              severity: 'error',
              summary: 'Registration failed',
              detail: res.message ?? 'Please check the form and try again.',
            });
            return;
          }
          if (res.token) {
            this.tokens.setToken(res.token);
          }
          this.messageService.add({
            severity: 'success',
            summary: 'Welcome',
            detail: 'Your company is ready.',
          });
          void this.router.navigate(['/dashboard']);
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message ?? 'Registration failed.';
          this.messageService.add({ severity: 'error', summary: 'Error', detail: msg });
        },
      });
  }

  cancel() {
    this.router.navigate(['/']);
  }
}
