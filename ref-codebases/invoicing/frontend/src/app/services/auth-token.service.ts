import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject } from 'rxjs';

const STORAGE_KEY = 'e_invoicing_sanctum_token';

@Injectable({ providedIn: 'root' })
export class AuthTokenService {
  private readonly platformId = inject(PLATFORM_ID);

  /** Emit after login, logout, or clear so layouts can refresh auth UI. */
  readonly authChanged = new Subject<void>();

  getToken(): string | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }
    return localStorage.getItem(STORAGE_KEY);
  }

  hasToken(): boolean {
    const t = this.getToken();
    return typeof t === 'string' && t.length > 0;
  }

  setToken(token: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, token);
    this.authChanged.next();
  }

  clear(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    this.authChanged.next();
  }
}
