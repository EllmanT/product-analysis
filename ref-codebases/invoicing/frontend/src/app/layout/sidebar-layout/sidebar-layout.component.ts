import { Component, signal, inject, OnInit, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  RouterOutlet,
  RouterLink,
  RouterLinkActive,
  Router,
  NavigationEnd,
} from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Subject, takeUntil } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthTokenService } from '../../services/auth-token.service';
import { AppTopNavComponent } from '../app-top-nav/app-top-nav.component';
import { GlobalLoaderComponent } from '../../components/global-loader/global-loader.component';

export interface NavChild {
  label: string;
  route: string;
  icon: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  /** Single destination (no sub-menu). */
  route?: string;
  children?: NavChild[];
}

export interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ButtonModule,
    AppTopNavComponent,
    GlobalLoaderComponent,
  ],
  templateUrl: './sidebar-layout.component.html',
  styleUrl: './sidebar-layout.component.css',
})
export class SidebarLayoutComponent implements OnInit, OnDestroy {
  private tokens = inject(AuthTokenService);
  private api = inject(ApiService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  sidebarCollapsed = signal(false);
  /** Hide sidebar logout strip on full-height pages (e.g. reports). */
  showSidebarFooter = signal(true);

  private session = signal<{ company: any | null } | null>(null);
  hasCompany = computed(() => !!this.session()?.company);

  /** Sections shown under “Main menu” grouping in the template. */
  navSections = computed<NavSection[]>(() => this.buildNavSections(this.hasCompany()));

  expandedItems = signal<Record<string, boolean>>({});

  ngOnInit(): void {
    this.syncSidebarFooterVisibility();
    this.api.getAuthSession().subscribe({
      next: (s) => {
        // Avoid ExpressionChanged errors by updating state after the initial check.
        queueMicrotask(() => this.session.set(s as any));
      },
      error: () => {
        queueMicrotask(() => this.session.set(null));
      },
    });
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => this.syncSidebarFooterVisibility());

  }

  private buildNavSections(hasCompany: boolean): NavSection[] {
    return [
      {
        id: 'overview',
        title: 'Overview',
        items: [
          { id: 'dashboard', label: 'Dashboard', icon: 'pi-home', route: '/dashboard' },
          ...(hasCompany ? [{ id: 'company', label: 'Company & devices', icon: 'pi-building', route: '/company' }] : []),
          ...(!hasCompany ? [{ id: 'apply-fiscalization', label: 'Apply fiscalization', icon: 'pi-shield', route: '/apply-fiscalization' }] : []),
        ],
      },
      {
        id: 'sales',
        title: 'Sales',
        items: [
          {
            id: 'reports',
            label: 'Reports',
            icon: 'pi-chart-bar',
            children: [
              { label: 'Sales', route: '/reports/sales', icon: 'pi-chart-line' },
              { label: 'By product', route: '/reports/by-product', icon: 'pi-box' },
              { label: 'By buyer', route: '/reports/by-buyer', icon: 'pi-users' },
            ],
          },
          {
            id: 'invoices',
            label: 'Invoices',
            icon: 'pi-file',
            children: [
              { label: 'All invoices', route: '/invoices', icon: 'pi-list' },
              { label: 'New fiscal invoice', route: '/invoice/new/fiscal-invoice', icon: 'pi-plus' },
              { label: 'New credit note', route: '/invoice/new/credit-note', icon: 'pi-plus' },
              { label: 'New debit note', route: '/invoice/new/debit-note', icon: 'pi-plus' },
              { label: 'Fiscal day', route: '/fiscal-day', icon: 'pi-calendar' },
            ],
          },
        ],
      },
      {
        id: 'catalog',
        title: 'Catalog',
        items: [
          { id: 'products', label: 'Products', icon: 'pi-box', route: '/products' },
          { id: 'buyers', label: 'Buyers', icon: 'pi-users', route: '/buyers' },
          { id: 'hs-codes', label: 'HS codes', icon: 'pi-table', route: '/hs-codes' },
        ],
      },
      {
        id: 'settings',
        title: 'Settings',
        items: [
          {
            id: 'settings-menu',
            label: 'Settings',
            icon: 'pi-cog',
            children: [
              { label: 'Units of measure', route: '/settings/units', icon: 'pi-list' },
              { label: 'Tax rates', route: '/settings/taxes', icon: 'pi-percentage' },
              { label: 'Fiscal day schedule', route: '/settings/fiscal-schedule', icon: 'pi-clock' },
              { label: 'Activation code', route: '/settings/activation', icon: 'pi-key' },
            ],
          },
        ],
      },
      {
        id: 'billing',
        title: 'Billing',
        items: [
          {
            id: 'billing',
            label: 'Billing',
            icon: 'pi-credit-card',
            children: [
              { label: 'Overview', route: '/billing', icon: 'pi-home' },
              { label: 'History', route: '/billing/history', icon: 'pi-clock' },
            ],
          },
        ],
      },
    ];
  }

  private syncSidebarFooterVisibility(): void {
    const path = this.router.url.split('?')[0] ?? '';
    this.showSidebarFooter.set(!path.startsWith('/reports'));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.set(!this.sidebarCollapsed());
  }

  toggleItem(id: string): void {
    this.expandedItems.update((m) => {
      const open =
        m[id] !== undefined
          ? m[id]
          : id === 'invoices' || id === 'reports' || id === 'settings-menu';
      return { ...m, [id]: !open };
    });
  }

  isExpanded(id: string): boolean {
    const v = this.expandedItems()[id];
    if (v !== undefined) {
      return v;
    }
    if (id === 'invoices') {
      return true;
    }
    if (id === 'reports') {
      const path = this.router.url.split('?')[0] ?? '';
      return path.startsWith('/reports');
    }
    if (id === 'settings-menu') {
      const path = this.router.url.split('?')[0] ?? '';
      return path.startsWith('/settings');
    }
    return false;
  }

  itemIsActive(item: NavItem): boolean {
    if (item.route) {
      return this.router.isActive(item.route, {
        paths: 'subset',
        queryParams: 'ignored',
        fragment: 'ignored',
        matrixParams: 'ignored',
      });
    }
    if (item.children?.length) {
      return item.children.some((c) =>
        this.router.isActive(c.route, {
          paths: 'subset',
          queryParams: 'ignored',
          fragment: 'ignored',
          matrixParams: 'ignored',
        })
      );
    }
    return false;
  }

  /** First child route when sidebar is collapsed (sub-menus hidden). */
  collapsedParentLink(item: NavItem): string {
    return item.children?.[0]?.route ?? '/dashboard';
  }

  logout(): void {
    if (this.tokens.hasToken()) {
      this.api.logout().subscribe({
        error: () => undefined,
      });
    }
    this.tokens.clear();
    void this.router.navigate(['/login']);
  }
}
