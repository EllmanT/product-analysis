import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { NgClass } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { Subject, takeUntil } from 'rxjs';
import { AuthTokenService } from '../../services/auth-token.service';
import { ApiService } from '../../services/api.service';

const SITE_NAME = 'E-Invoicing';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgClass, ButtonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent implements OnInit, OnDestroy {
  protected readonly siteName = SITE_NAME;
  protected readonly darkMode = signal(false);
  protected readonly isLoggedIn = signal(false);

  private router = inject(Router);
  private tokens = inject(AuthTokenService);
  private api = inject(ApiService);
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    const sync = () => this.isLoggedIn.set(this.tokens.hasToken());
    sync();
    this.tokens.authChanged.pipe(takeUntil(this.destroy$)).subscribe(() => sync());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleTheme(): void {
    this.darkMode.update((v) => !v);
    document.documentElement.classList.toggle('app-dark', this.darkMode());
  }

  login(): void {
    void this.router.navigate(['/login']);
  }

  signUp(): void {
    void this.router.navigate(['/signup']);
  }

  logout(): void {
    if (this.tokens.hasToken()) {
      this.api.logout().subscribe({ error: () => undefined });
    }
    this.tokens.clear();
    void this.router.navigate(['/login']);
  }
}
