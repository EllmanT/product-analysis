import { Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthTokenService } from '../../services/auth-token.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  template: `
    <div class="login-page">
      <div class="login-backdrop" aria-hidden="true"></div>
      <div class="login-card" role="status" aria-live="polite">
        <div class="login-card-glow" aria-hidden="true"></div>
        <div class="login-header">
          <div class="login-logo-mark">
            <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
          </div>
          <h1 class="login-title">Signing you in…</h1>
          <p class="login-sub">
            @if (error()) {
              {{ error() }}
            } @else {
              Please wait while we complete your login.
            }
          </p>
        </div>

        @if (error()) {
          <p-button
            type="button"
            label="Back to sign in"
            styleClass="login-submit w-full"
            (onClick)="goLogin()"
          />
        }
      </div>
    </div>
  `,
})
export class AuthCallbackComponent {
  private platformId = inject(PLATFORM_ID);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private tokens = inject(AuthTokenService);

  error = signal<string | null>(null);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const token = this.route.snapshot.queryParamMap.get('token');
    const message = this.route.snapshot.queryParamMap.get('message');

    if (token && token.trim().length > 0) {
      this.tokens.setToken(token);
      void this.router.navigateByUrl('/dashboard');
      return;
    }

    this.error.set(message ?? 'We could not complete sign in. Please try again.');
  }

  goLogin(): void {
    void this.router.navigate(['/login']);
  }
}

