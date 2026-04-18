import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ApiService } from '../../services/api.service';
import { AuthTokenService } from '../../services/auth-token.service';
import { environment } from '../../../environments/environment';
import { GoogleGIconComponent } from '../../components/google-g-icon/google-g-icon.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    GoogleGIconComponent,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private api = inject(ApiService);
  private tokens = inject(AuthTokenService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private messages = inject(MessageService);

  /** Sign-in method shown in the card */
  mode = signal<'password' | 'activation'>('password');

  email = '';
  password = '';
  /** 6-char activation (WhatsApp / integrations) */
  activationCode = '';

  submitting = signal(false);

  oauth(provider: 'google' | 'facebook'): void {
    const redirectUri = `${window.location.origin}/auth/callback`;
    const url = `${environment.apiUrl}/api/public/oauth/${provider}/redirect?redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.location.assign(url);
  }

  handleSubmit(): void {
    if (this.mode() === 'password') {
      this.submitPassword();
    } else {
      this.submitActivation();
    }
  }

  submitPassword(): void {
    const email = this.email.trim();
    if (!email || !this.password) {
      this.messages.add({
        severity: 'warn',
        summary: 'Missing fields',
        detail: 'Enter your email and password.',
      });
      return;
    }

    this.submitting.set(true);
    this.api.login({ email, password: this.password }).subscribe({
      next: (res) => this.onAuthSuccess(res.token),
      error: (err) => {
        this.submitting.set(false);
        const msg =
          err?.error?.message ??
          err?.error?.errors?.email?.[0] ??
          'Invalid email or password.';
        this.messages.add({ severity: 'error', summary: 'Sign in failed', detail: msg });
      },
    });
  }

  submitActivation(): void {
    const code = this.activationCode.trim().toUpperCase().replace(/\s+/g, '');
    if (code.length !== 6) {
      this.messages.add({
        severity: 'warn',
        summary: 'Invalid code',
        detail: 'Enter the 6-character activation code.',
      });
      return;
    }

    this.submitting.set(true);
    this.api.loginWithActivationCode({ activation_code: code }).subscribe({
      next: (res) => this.onAuthSuccess(res.token),
      error: (err) => {
        this.submitting.set(false);
        const msg =
          err?.error?.message ??
          err?.error?.errors?.activation_code?.[0] ??
          'Invalid or expired activation code.';
        this.messages.add({ severity: 'error', summary: 'Sign in failed', detail: msg });
      },
    });
  }

  private onAuthSuccess(token: string): void {
    this.tokens.setToken(token);
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    const target =
      returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')
        ? returnUrl
        : '/dashboard';
    void this.router.navigateByUrl(target);
    this.submitting.set(false);
  }
}
