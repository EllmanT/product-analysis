import {
  Component,
  OnInit,
  signal,
  inject,
  computed,
  ViewChild,
  PLATFORM_ID,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Popover, PopoverModule } from 'primeng/popover';
import { ApiService, AuthSessionUser } from '../../services/api.service';
import { AuthTokenService } from '../../services/auth-token.service';

function displayNameFromUser(user: AuthSessionUser | null): string {
  if (!user) return '';
  const first = (user.first_name ?? '').trim();
  const last = (user.last_name ?? '').trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  return (user.email ?? '').trim() || 'User';
}

function initialsFromUser(user: AuthSessionUser | null): string {
  if (!user) return '?';
  const first = (user.first_name ?? '').trim();
  const last = (user.last_name ?? '').trim();
  if (first && last) {
    return (first[0] + last[0]).toUpperCase();
  }
  if (first) {
    const parts = first.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return first.slice(0, 2).toUpperCase();
  }
  const email = (user.email ?? '').trim();
  if (email.length >= 2) {
    return email.slice(0, 2).toUpperCase();
  }
  return '?';
}

@Component({
  selector: 'app-top-nav',
  standalone: true,
  imports: [RouterLink, PopoverModule],
  templateUrl: './app-top-nav.component.html',
  styleUrl: './app-top-nav.component.css',
})
export class AppTopNavComponent implements OnInit {
  @ViewChild('userMenu') userMenu?: Popover;

  protected readonly sessionUser = signal<AuthSessionUser | null>(null);

  protected readonly displayName = computed(() => displayNameFromUser(this.sessionUser()));
  protected readonly initials = computed(() => initialsFromUser(this.sessionUser()));

  private router = inject(Router);
  private tokens = inject(AuthTokenService);
  private api = inject(ApiService);
  private platformId = inject(PLATFORM_ID);
  private destroyRef = inject(DestroyRef);

  constructor() {
    this.tokens.authChanged.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.loadSessionUser();
    });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadSessionUser();
    }
  }

  private loadSessionUser(): void {
    if (!isPlatformBrowser(this.platformId) || !this.tokens.hasToken()) {
      this.sessionUser.set(null);
      return;
    }
    this.api.getAuthSession().subscribe({
      next: (res) => this.sessionUser.set(res.user ?? null),
      error: () => this.sessionUser.set(null),
    });
  }

  openUserMenu(event: Event, target: HTMLElement): void {
    this.userMenu?.toggle(event, target);
  }

  closeUserMenu(): void {
    this.userMenu?.hide();
  }

  goGuide(): void {
    this.closeUserMenu();
    void this.router.navigate(['/guide-app']);
  }

  goHelp(): void {
    this.closeUserMenu();
    void this.router.navigate(['/help-center']);
  }

  logout(): void {
    this.closeUserMenu();
    if (this.tokens.hasToken()) {
      this.api.logout().subscribe({ error: () => undefined });
    }
    this.tokens.clear();
    void this.router.navigate(['/login']);
  }
}
