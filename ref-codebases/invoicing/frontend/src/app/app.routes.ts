import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { redirectAuthedToDashboardGuard } from './guards/redirect-authed-home.guard';

export const routes: Routes = [
  // Public routes: top nav + footer (guest layout)
  {
    path: '',
    loadComponent: () => import('./layout/guest-layout/guest-layout.component').then((m) => m.GuestLayoutComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/guest-invoice/guest-invoice.component').then((m) => m.GuestInvoiceComponent),
        canActivate: [redirectAuthedToDashboardGuard],
      },
      { path: 'login', loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent) },
      {
        path: 'signup',
        loadComponent: () => import('./features/signup/signup.component').then((m) => m.SignupComponent),
        canActivate: [redirectAuthedToDashboardGuard],
      },
      { path: 'company-setup', loadComponent: () => import('./features/company-setup/company-setup.component').then((m) => m.CompanySetupComponent) },
      { path: 'fiscal-setup', pathMatch: 'full', redirectTo: 'login' },
      // OAuth callback from backend (Google/Facebook)
      { path: 'auth/callback', loadComponent: () => import('./features/auth-callback/auth-callback.component').then((m) => m.AuthCallbackComponent) },
      { path: 'help', loadComponent: () => import('./pages/help/help.component').then((m) => m.HelpComponent) },
      { path: 'about', loadComponent: () => import('./pages/about/about.component').then((m) => m.AboutComponent) },
      { path: 'guide', loadComponent: () => import('./pages/guide/guide.component').then((m) => m.GuideComponent) },
      { path: 'terms', loadComponent: () => import('./pages/terms/terms.component').then((m) => m.TermsComponent) },
      { path: 'privacy', loadComponent: () => import('./pages/privacy/privacy.component').then((m) => m.PrivacyComponent) },
    ],
  },

  // Authenticated routes (with sidebar)
  {
    path: '',
    loadComponent: () => import('./layout/sidebar-layout/sidebar-layout.component').then((m) => m.SidebarLayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
      { path: 'company', loadComponent: () => import('./features/company/company.component').then((m) => m.CompanyComponent) },
      { path: 'apply-fiscalization', loadComponent: () => import('./features/fiscal-setup/fiscal-setup.component').then((m) => m.FiscalSetupComponent) },
      {
        path: 'invoice',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'new' },
          {
            path: 'new',
            children: [
              { path: '', pathMatch: 'full', redirectTo: 'fiscal-invoice' },
              {
                path: 'fiscal-invoice',
                loadComponent: () =>
                  import('./features/invoice/new-fiscal-invoice.component').then((m) => m.NewFiscalInvoiceComponent),
              },
              {
                path: 'credit-note',
                loadComponent: () =>
                  import('./features/invoice/new-credit-note.component').then((m) => m.NewCreditNoteComponent),
              },
              {
                path: 'debit-note',
                loadComponent: () =>
                  import('./features/invoice/new-debit-note.component').then((m) => m.NewDebitNoteComponent),
              },
            ],
          },
        ],
      },
      { path: 'invoices', loadComponent: () => import('./features/invoices/invoices.component').then((m) => m.InvoicesComponent) },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports-shell.component').then((m) => m.ReportsShellComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'sales' },
          {
            path: 'sales',
            loadComponent: () =>
              import('./features/reports/reports-sales.component').then((m) => m.ReportsSalesComponent),
          },
          {
            path: 'by-product',
            loadComponent: () =>
              import('./features/reports/reports-by-product.component').then((m) => m.ReportsByProductComponent),
          },
          {
            path: 'by-buyer',
            loadComponent: () =>
              import('./features/reports/reports-by-buyer.component').then((m) => m.ReportsByBuyerComponent),
          },
        ],
      },
      { path: 'history', redirectTo: 'invoices', pathMatch: 'full' },
      { path: 'products', loadComponent: () => import('./pages/products/products.component').then((m) => m.ProductsComponent) },
      { path: 'buyers', loadComponent: () => import('./pages/buyers/buyers.component').then((m) => m.BuyersComponent) },
      { path: 'hs-codes', loadComponent: () => import('./features/hs-codes/hs-codes.component').then((m) => m.HsCodesComponent) },
      { path: 'billing', loadComponent: () => import('./pages/billing/billing.component').then((m) => m.BillingComponent) },
      { path: 'billing/history', loadComponent: () => import('./pages/billing-history/billing-history.component').then((m) => m.BillingHistoryComponent) },
      {
        path: 'settings',
        loadComponent: () => import('./pages/settings/settings-shell.component').then((m) => m.SettingsShellComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'units' },
          {
            path: 'units',
            loadComponent: () => import('./pages/settings/settings-units.component').then((m) => m.SettingsUnitsComponent),
          },
          {
            path: 'taxes',
            loadComponent: () => import('./pages/settings/settings-taxes.component').then((m) => m.SettingsTaxesComponent),
          },
          {
            path: 'fiscal-schedule',
            loadComponent: () =>
              import('./pages/settings/settings-fiscal-schedule.component').then((m) => m.SettingsFiscalScheduleComponent),
          },
          {
            path: 'activation',
            loadComponent: () =>
              import('./pages/settings/settings-activation.component').then((m) => m.SettingsActivationComponent),
          },
        ],
      },
      { path: 'fiscal-day', loadComponent: () => import('./features/fiscal-day/fiscal-day.component').then((m) => m.FiscalDayComponent) },
      {
        path: 'help-center',
        loadComponent: () => import('./pages/help/help.component').then((m) => m.HelpComponent),
      },
      {
        path: 'guide-app',
        loadComponent: () => import('./pages/guide/guide.component').then((m) => m.GuideComponent),
      },
    ],
  },
];
