import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';

export interface HsCode {
  id?: string;
  code: string;
  description: string;
  category?: string | null;
  is_service?: boolean;
  default_tax_code?: string | null;
  is_active?: boolean;
}

/** HS code row with per-tenant preference (from `GET /api/company/hs-codes`). */
export interface TenantHsCode extends HsCode {
  tenant_preference_enabled?: boolean | null;
  usable_for_company?: boolean;
}

/** Seeded reference tax (read-only in UI). */
export interface TaxRate {
  id?: string;
  code: string;
  label: string;
  percent: number;
  sort_order?: number;
}

export interface UnitOfMeasure {
  id?: string;
  company_id?: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface FiscalDaySchedule {
  id: string | null;
  company_id?: string;
  is_enabled: boolean;
  auto_close_enabled: boolean;
  auto_open_enabled: boolean;
  close_time: string | null;
  open_time: string | null;
  close_weekdays: number[];
  open_weekdays: number[];
  timezone: string | null;
  last_auto_close_date: string | null;
  last_auto_open_date: string | null;
  updated_at?: string | null;
}

export interface Product {
  id?: string;
  company_id?: string;
  name: string;
  description?: string;
  hs_code?: string;
  default_unit_price: number;
  tax_code?: string;
  tax_percent?: number;
  unit_of_measure?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Buyer {
  id?: string;
  company_id?: string;
  name?: string;
  register_name?: string;
  trade_name?: string;
  tin?: string;
  vat_number?: string;
  address?: string;
  address_province?: string;
  address_city?: string;
  address_street?: string;
  address_house_no?: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface InvoiceLine {
  id?: string;
  invoice_id?: string;
  product_id?: string;
  product_code?: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  tax_code?: string;
  tax_percent?: number;
  tax_amount?: number;
  hs_code?: string;
}

export interface InvoiceTax {
  id?: string;
  invoice_id?: string;
  tax_code: string;
  tax_percent: number;
  tax_amount: number;
  sales_amount: number;
}

export interface Invoice {
  id?: string;
  company_id?: string;
  device_id?: string;
  buyer_id?: string;
  created_by_user_id?: string;
  invoice_no: string;
  receipt_type: 'FiscalInvoice' | 'CreditNote' | 'DebitNote';
  receipt_print_form: 'InvoiceA4' | 'Receipt48';
  receipt_currency: string;
  receipt_date: string;
  tax_inclusive: boolean;
  receipt_total: number;
  total_excl_tax?: number;
  total_vat: number;
  receipt_notes?: string;
  customer_reference?: string;
  payment_method: 'CASH' | 'CARD' | 'TRANSFER' | 'CHEQUE' | 'OTHER';
  payment_amount: number;
  ref_invoice_id?: string;
  ref_invoice_no?: string;
  ref_invoice_date?: string;
  ref_customer_reference?: string;
  ref_device_serial?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'QUEUED' | 'FAILED' | 'CANCELLED';
  fiscal_submission_at?: string;
  buyer_snapshot?: any;
  banking_details_snapshot?: any;
  created_at?: string;
  updated_at?: string;
  buyer?: Buyer;
  lines?: InvoiceLine[];
  taxes?: InvoiceTax[];
  fiscalResponse?: FiscalResponse;
}

export interface FiscalResponse {
  id?: string;
  invoice_id?: string;
  qr_code_url?: string;
  verification_code?: string;
  verification_link?: string;
  fiscal_day_no?: string;
  receipt_global_no?: string;
  receipt_counter?: string;
  receipt_id?: string;
  device_id?: string;
  fdms_invoice_no?: string;
  api_response_code?: number;
  api_response_message?: string;
  raw_response?: any;
  submitted_at?: string;
}

export interface CompanyDevice {
  id?: string;
  company_id?: string;
  fiscal_device_id?: string;
  device_serial_no?: string;
  device_name?: string;
  zimra_device_id?: string | null;
  zimra_activation_key?: string | null;
  zimra_environment?: string | null;
  fiscal_cloud_activated_at?: string | null;
  activation_status?: 'PENDING' | 'PROCESSING' | 'ACTIVATED' | 'FAILED' | string;
  activation_attempted_at?: string | null;
  activation_error?: string | null;
  fiscal_day_status?: 'OPEN' | 'CLOSED';
  fiscal_day_open_at?: string;
  is_active?: boolean;
  auto_open_close_day?: boolean;
  fiscal_cloud_payload?: any;
}

export interface FiscalDayStatusResponse {
  message: string;
  code: string | null;
  fiscal_day_status: string | null;
  data?: any;
}

export interface NonFiscalizedCompany {
  id?: string;
  company_name: string;
  registration_number: string;
  tax_id?: string;
  email: string;
  phone: string;
  physical_address?: string;
  city?: string;
  country: string;
  postal_code?: string;
  admin_first_name: string;
  admin_last_name: string;
  admin_email: string;
  admin_phone: string;
  admin_password?: string;
  admin_password_confirmation?: string;
  is_active?: boolean;
  email_verified?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LoginResponse {
  token: string;
  token_type: string;
  user: Record<string, unknown>;
}

/** GET /api/activation-code */
export interface ActivationCodeStatus {
  has_code: boolean;
  hint: string | null;
  updated_at: string | null;
}

export interface RegenerateActivationResponse {
  activation_code: string;
  hint?: string;
  message?: string;
}

export interface NonFiscalizedRegisterResponse {
  success: boolean;
  message?: string;
  token?: string;
  token_type?: string;
  data?: Record<string, unknown>;
  errors?: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: any;
}

// Fiscal Cloud lookup + register-via-lookup removed

export type DocProcessingResponse = {
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

export type ApplyFiscalizationResponse = ApiResponse<{
  company?: Record<string, unknown>;
  fiscal_cloud?: Record<string, unknown>;
}>;

export interface TenantDashboardTotals {
  products: number;
  buyers: number;
  invoices: number;
  receipt_total_sum: number;
}

export interface TenantDashboardCompany {
  id: string;
  legal_name: string;
  trade_name: string | null;
  tin: string;
  vat_number?: string | null;
  email?: string | null;
  phone?: string | null;
  region?: string | null;
  station?: string | null;
  province?: string | null;
  city?: string | null;
  address_line?: string | null;
  house_number?: string | null;
  axis_billing_customer_id?: number | null;
}

/** Authenticated session from `GET /api/user`. */
export interface AuthSessionUser {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface AuthSessionResponse {
  user: AuthSessionUser;
  company: TenantDashboardCompany | null;
}

export interface AxisProduct {
  id: string | number;
  name?: string;
  description?: string | null;
}

export interface AxisPlan {
  id: string | number;
  name?: string;
  price?: number;
  currency?: string;
  interval?: string;
  description?: string | null;
  plan_id?: string | number;
  amount?: number;
  billing_interval?: string;
}

export interface AxisSubscription {
  id?: string | number;
  subscription_id?: string | number;
  customer_id?: number | string | null;
  plan_id?: number | string | null;
  status?: string | null;
}

export interface TenantDashboardStatusRow {
  status: string;
  count: number;
}

export interface TenantDashboardDayRow {
  date: string;
  invoice_count: number;
  revenue: number;
}

export interface TenantDashboardWeekRow {
  period: string;
  revenue: number;
}

export type TenantDashboardResponse =
  | { has_company: false; message?: string }
  | {
      has_company: true;
      company: TenantDashboardCompany;
      totals: TenantDashboardTotals;
      invoices_by_status: TenantDashboardStatusRow[];
      invoices_by_day: TenantDashboardDayRow[];
      revenue_by_week: TenantDashboardWeekRow[];
    };

export interface SalesReportSeriesRow {
  period: string;
  invoice_count: number;
  revenue: number;
}

export interface SalesReportResponse {
  from: string;
  to: string;
  group_by: 'day' | 'week' | 'month';
  summary: {
    total_revenue: number;
    invoice_count: number;
  };
  series: SalesReportSeriesRow[];
}

export interface ProductReportSeriesRow {
  product_id: string | null;
  product_name: string;
  quantity_sold: number;
  revenue: number;
  invoice_count: number;
}

export interface ProductReportResponse {
  from: string;
  to: string;
  summary: {
    total_revenue: number;
    invoice_count: number;
    line_count: number;
  };
  series: ProductReportSeriesRow[];
}

export interface BuyerReportSeriesRow {
  buyer_id: string | null;
  buyer_name: string;
  invoice_count: number;
  revenue: number;
}

export interface BuyerReportResponse {
  from: string;
  to: string;
  summary: {
    total_revenue: number;
    invoice_count: number;
  };
  series: BuyerReportSeriesRow[];
}

export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;
  private docProcessingUrl = 'https://vat-doc-processing-backend.vercel.app/api/v1/docprocessing';

  login(body: { email: string; password: string }): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/api/public/login`, body);
  }

  register(body: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    password: string;
    password_confirmation: string;
  }): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/api/public/register`, body);
  }

  /** Link company to the authenticated user (signed up without company). */
  completeNonFiscalizedCompanyProfile(body: {
    company_name: string;
    registration_number: string;
    tax_id?: string;
    email: string;
    phone: string;
    physical_address?: string;
    city?: string;
    country: string;
    postal_code?: string;
  }): Observable<NonFiscalizedRegisterResponse> {
    return this.http.post<NonFiscalizedRegisterResponse>(
      `${this.baseUrl}/api/non-fiscalized-companies/complete-profile`,
      body
    );
  }

  loginWithActivationCode(body: { activation_code: string }): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/api/public/login/activation-code`, body);
  }

  getActivationCodeStatus(): Observable<ActivationCodeStatus> {
    return this.http.get<ActivationCodeStatus>(`${this.baseUrl}/api/activation-code`);
  }

  regenerateActivationCode(): Observable<RegenerateActivationResponse> {
    return this.http.post<RegenerateActivationResponse>(`${this.baseUrl}/api/activation-code/regenerate`, {});
  }

  logout(): Observable<{ message?: string }> {
    return this.http.post<{ message?: string }>(`${this.baseUrl}/api/logout`, {});
  }

  /** Current user + company summary (Sanctum). */
  getAuthSession(): Observable<AuthSessionResponse> {
    return this.http.get<AuthSessionResponse>(`${this.baseUrl}/api/user`);
  }

  // Axis Billing (proxied via backend)
  listAxisProducts(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/api/axis-billing/products`);
  }

  listAxisPlans(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/api/axis-billing/plans`);
  }

  listAxisSubscriptions(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/api/axis-billing/subscriptions`);
  }

  getAxisCustomerSubscriptions(customerId: string | number): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/api/axis-billing/customers/${customerId}/subscriptions`);
  }

  createAxisSubscription(payload: Record<string, unknown>): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/api/axis-billing/subscriptions`, payload);
  }

  activateAxisSubscription(subscriptionId: string | number): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/api/axis-billing/subscriptions/${subscriptionId}/activate`, {});
  }

  cancelAxisSubscription(subscriptionId: string | number, payload: Record<string, unknown> = {}): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/api/axis-billing/subscriptions/${subscriptionId}/cancel`, payload);
  }

  createAxisCheckoutSession(payload: Record<string, unknown>): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/api/axis-billing/checkout-sessions`, payload);
  }

  // Products
  getProducts(params?: any): Observable<PaginatedResponse<Product>> {
    let httpParams = new HttpParams();
    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined) {
          httpParams = httpParams.set(key, params[key]);
        }
      });
    }
    return this.http.get<PaginatedResponse<Product>>(`${this.baseUrl}/api/products`, { params: httpParams });
  }

  getProduct(id: string): Observable<Product> {
    return this.http.get<Product>(`${this.baseUrl}/api/products/${id}`);
  }

  createProduct(product: Partial<Product>): Observable<Product> {
    return this.http.post<Product>(`${this.baseUrl}/api/products`, product);
  }

  updateProduct(id: string, product: Partial<Product>): Observable<Product> {
    return this.http.put<Product>(`${this.baseUrl}/api/products/${id}`, product);
  }

  deleteProduct(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/products/${id}`);
  }

  getTaxRates(): Observable<TaxRate[]> {
    return this.http.get<TaxRate[]>(`${this.baseUrl}/api/tax-rates`);
  }

  getUnitsOfMeasure(params?: { page?: number; per_page?: number; search?: string }): Observable<PaginatedResponse<UnitOfMeasure>> {
    let httpParams = new HttpParams();
    if (params?.page != null) {
      httpParams = httpParams.set('page', String(params.page));
    }
    if (params?.per_page != null) {
      httpParams = httpParams.set('per_page', String(params.per_page));
    }
    if (params?.search != null && params.search !== '') {
      httpParams = httpParams.set('search', params.search);
    }
    return this.http.get<PaginatedResponse<UnitOfMeasure>>(`${this.baseUrl}/api/units-of-measure`, {
      params: httpParams,
    });
  }

  createUnitOfMeasure(body: { name: string }): Observable<UnitOfMeasure> {
    return this.http.post<UnitOfMeasure>(`${this.baseUrl}/api/units-of-measure`, body);
  }

  updateUnitOfMeasure(id: string, body: { name: string }): Observable<UnitOfMeasure> {
    return this.http.put<UnitOfMeasure>(`${this.baseUrl}/api/units-of-measure/${id}`, body);
  }

  deleteUnitOfMeasure(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/units-of-measure/${id}`);
  }

  getFiscalDaySchedule(): Observable<FiscalDaySchedule> {
    return this.http.get<FiscalDaySchedule>(`${this.baseUrl}/api/settings/fiscal-day-schedule`);
  }

  updateFiscalDaySchedule(body: Partial<FiscalDaySchedule>): Observable<FiscalDaySchedule> {
    return this.http.put<FiscalDaySchedule>(`${this.baseUrl}/api/settings/fiscal-day-schedule`, body);
  }

  // Buyers
  getBuyers(params?: any): Observable<PaginatedResponse<Buyer>> {
    let httpParams = new HttpParams();
    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined) {
          httpParams = httpParams.set(key, params[key]);
        }
      });
    }
    return this.http.get<PaginatedResponse<Buyer>>(`${this.baseUrl}/api/buyers`, { params: httpParams });
  }

  createBuyer(buyer: Partial<Buyer>): Observable<Buyer> {
    return this.http.post<Buyer>(`${this.baseUrl}/api/buyers`, buyer);
  }

  updateBuyer(id: string, buyer: Partial<Buyer>): Observable<Buyer> {
    return this.http.put<Buyer>(`${this.baseUrl}/api/buyers/${id}`, buyer);
  }

  deleteBuyer(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/buyers/${id}`);
  }

  getBuyersList(params?: any): Observable<Buyer[]> {
    return this.getBuyers(params).pipe(
      map((response: PaginatedResponse<Buyer> | Buyer[]) => {
        const rows = Array.isArray(response) ? response : (response.data ?? []);
        return rows.map((buyer) => ({
          ...buyer,
          name: buyer.name ?? buyer.register_name ?? '',
          address:
            buyer.address ??
            [buyer.address_house_no, buyer.address_street, buyer.address_city]
              .filter((part) => part && String(part).trim() !== '')
              .join(', '),
        }));
      })
    );
  }

  // Invoices
  getInvoices(params?: any): Observable<PaginatedResponse<Invoice>> {
    let httpParams = new HttpParams();
    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined) {
          httpParams = httpParams.set(key, params[key]);
        }
      });
    }
    return this.http.get<PaginatedResponse<Invoice>>(`${this.baseUrl}/api/invoices`, { params: httpParams });
  }

  getInvoice(id: string): Observable<Invoice> {
    return this.http.get<Invoice>(`${this.baseUrl}/api/invoices/${id}`);
  }

  createInvoice(invoice: Partial<Invoice>): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.baseUrl}/api/invoices`, invoice);
  }

  updateInvoice(id: string, invoice: Partial<Invoice>): Observable<Invoice> {
    return this.http.put<Invoice>(`${this.baseUrl}/api/invoices/${id}`, invoice);
  }

  deleteInvoice(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/invoices/${id}`);
  }

  // Fiscalization
  fiscalizeInvoice(id: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/api/invoices/${id}/fiscalize`, {});
  }

  openFiscalDay(): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/api/fiscal/day/open`, {});
  }

  closeFiscalDay(): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/api/fiscal/day/close`, {});
  }

  getFiscalDayStatus(): Observable<FiscalDayStatusResponse> {
    return this.http.get<FiscalDayStatusResponse>(`${this.baseUrl}/api/fiscal/day/status`);
  }

  // Devices
  getDevices(params?: any): Observable<PaginatedResponse<CompanyDevice>> {
    let httpParams = new HttpParams();
    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined) {
          httpParams = httpParams.set(key, params[key]);
        }
      });
    }
    return this.http.get<PaginatedResponse<CompanyDevice>>(`${this.baseUrl}/api/company-devices`, { params: httpParams });
  }

  retryDeviceActivation(id: string): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.baseUrl}/api/company-devices/${id}/retry-activation`, {});
  }

  /** Public registration; response may include Sanctum token for immediate sign-in. */
  registerNonFiscalizedCompany(companyData: Partial<NonFiscalizedCompany>): Observable<NonFiscalizedRegisterResponse> {
    return this.http.post<NonFiscalizedRegisterResponse>(
      `${this.baseUrl}/api/public/non-fiscalized-companies/register`,
      companyData
    );
  }

  getNonFiscalizedCompanyMe(): Observable<ApiResponse<Record<string, unknown>>> {
    return this.http.get<ApiResponse<Record<string, unknown>>>(`${this.baseUrl}/api/non-fiscalized-companies/me`);
  }

  processVatDocument(file: File): Observable<DocProcessingResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<DocProcessingResponse>(this.docProcessingUrl, form);
  }

  applyFiscalization(
    body: {
      vat_registered: boolean;
      name: string;
      trade_name: string;
      tin: string;
      vat?: string;
      region: string;
      station: string;
      province: string;
      city: string;
      address: string;
      house_number: string;
      company_phone: string;
      company_email: string;
    },
    file: File
  ): Observable<ApplyFiscalizationResponse> {
    const form = new FormData();
    Object.entries(body).forEach(([k, v]) => {
      if (v === undefined || v === null || String(v).trim() === '') return;
      if (k === 'vat_registered') {
        form.append(k, v === true ? '1' : '0');
        return;
      }
      form.append(k, String(v));
    });
    form.append('tax_certificate', file);
    return this.http.post<ApplyFiscalizationResponse>(`${this.baseUrl}/api/fiscal-companies/apply`, form);
  }

  /** Tenant-scoped analytics (company resolved from the authenticated user). */
  getDashboard(): Observable<TenantDashboardResponse> {
    return this.http.get<TenantDashboardResponse>(`${this.baseUrl}/api/dashboard`);
  }

  /** Sales by period (receipt_date) for the authenticated tenant. */
  getSalesReport(params: {
    from: string;
    to: string;
    group_by?: 'day' | 'week' | 'month';
  }): Observable<SalesReportResponse> {
    let httpParams = new HttpParams().set('from', params.from).set('to', params.to);
    if (params.group_by) {
      httpParams = httpParams.set('group_by', params.group_by);
    }
    return this.http.get<SalesReportResponse>(`${this.baseUrl}/api/reports/sales`, { params: httpParams });
  }

  /** Revenue and quantity by product (invoice lines) for the authenticated tenant. */
  getProductReport(params: { from: string; to: string }): Observable<ProductReportResponse> {
    const httpParams = new HttpParams().set('from', params.from).set('to', params.to);
    return this.http.get<ProductReportResponse>(`${this.baseUrl}/api/reports/by-product`, { params: httpParams });
  }

  /** Invoice totals grouped by buyer for the authenticated tenant. */
  getBuyerReport(params: { from: string; to: string }): Observable<BuyerReportResponse> {
    const httpParams = new HttpParams().set('from', params.from).set('to', params.to);
    return this.http.get<BuyerReportResponse>(`${this.baseUrl}/api/reports/by-buyer`, { params: httpParams });
  }

  /** Paginated HS tariff reference (read-only). */
  getHsCodes(params?: { page?: number; per_page?: number; search?: string }): Observable<PaginatedResponse<HsCode>> {
    let httpParams = new HttpParams();
    if (params?.page != null) {
      httpParams = httpParams.set('page', String(params.page));
    }
    if (params?.per_page != null) {
      httpParams = httpParams.set('per_page', String(params.per_page));
    }
    if (params?.search != null && params.search !== '') {
      httpParams = httpParams.set('search', params.search);
    }
    return this.http.get<PaginatedResponse<HsCode>>(`${this.baseUrl}/api/hs-codes`, { params: httpParams });
  }

  /** Paginated HS codes with tenant enablement (authenticated company). */
  getCompanyHsCodes(params?: {
    page?: number;
    per_page?: number;
    search?: string;
    usable_only?: boolean;
  }): Observable<PaginatedResponse<TenantHsCode>> {
    let httpParams = new HttpParams();
    if (params?.page != null) {
      httpParams = httpParams.set('page', String(params.page));
    }
    if (params?.per_page != null) {
      httpParams = httpParams.set('per_page', String(params.per_page));
    }
    if (params?.search != null && params.search !== '') {
      httpParams = httpParams.set('search', params.search);
    }
    if (params?.usable_only === true) {
      httpParams = httpParams.set('usable_only', '1');
    }
    return this.http.get<PaginatedResponse<TenantHsCode>>(`${this.baseUrl}/api/company/hs-codes`, {
      params: httpParams,
    });
  }

  /** Batch upsert per-tenant HS code enablement. */
  syncCompanyHsCodePreferences(payload: {
    items: { hs_code_id: string; is_enabled: boolean }[];
  }): Observable<{ message?: string }> {
    return this.http.put<{ message?: string }>(
      `${this.baseUrl}/api/company/hs-codes/preferences`,
      payload
    );
  }

  /** Clear per-tenant overrides (enable all defaults) or disable every active catalog HS code. */
  setAllCompanyHsCodePreferences(enabled: boolean): Observable<{ message?: string }> {
    return this.http.put<{ message?: string }>(`${this.baseUrl}/api/company/hs-codes/set-all`, {
      enabled,
    });
  }
}
