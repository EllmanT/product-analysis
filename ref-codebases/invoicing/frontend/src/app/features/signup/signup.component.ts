import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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
  selector: 'app-signup',
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
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.css',
})
export class SignupComponent {
  private api = inject(ApiService);
  private tokens = inject(AuthTokenService);
  private router = inject(Router);
  private messages = inject(MessageService);

  firstName = '';
  lastName = '';
  email = '';
  phone = '';
  password = '';
  passwordConfirmation = '';

  submitting = signal(false);

  oauth(provider: 'google' | 'facebook'): void {
    const redirectUri = `${window.location.origin}/auth/callback`;
    const url = `${environment.apiUrl}/api/public/oauth/${provider}/redirect?redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.location.assign(url);
  }

  submit(): void {
    const first_name = this.firstName.trim();
    const last_name = this.lastName.trim();
    const email = this.email.trim().toLowerCase();

    if (!first_name || !last_name) {
      this.messages.add({
        severity: 'warn',
        summary: 'Missing name',
        detail: 'Enter your first and last name.',
      });
      return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.messages.add({
        severity: 'warn',
        summary: 'Email',
        detail: 'Enter a valid email address.',
      });
      return;
    }

    const phone = this.phone.trim();
    if (!phone) {
      this.messages.add({
        severity: 'warn',
        summary: 'Phone',
        detail: 'Enter your phone number.',
      });
      return;
    }

    if (this.password.length < 8) {
      this.messages.add({
        severity: 'warn',
        summary: 'Password',
        detail: 'Password must be at least 8 characters.',
      });
      return;
    }

    if (this.password !== this.passwordConfirmation) {
      this.messages.add({
        severity: 'warn',
        summary: 'Password',
        detail: 'Passwords do not match.',
      });
      return;
    }

    this.submitting.set(true);
    this.api
      .register({
        first_name,
        last_name,
        email,
        phone,
        password: this.password,
        password_confirmation: this.passwordConfirmation,
      })
      .subscribe({
        next: (res) => {
          this.tokens.setToken(res.token);
          void this.router.navigateByUrl('/dashboard');
          this.submitting.set(false);
        },
        error: (err) => {
          this.submitting.set(false);
          const msg =
            err?.error?.message ??
            err?.error?.errors?.email?.[0] ??
            err?.error?.errors?.password?.[0] ??
            'Could not create your account.';
          this.messages.add({ severity: 'error', summary: 'Sign up failed', detail: msg });
        },
      });
  }
}
