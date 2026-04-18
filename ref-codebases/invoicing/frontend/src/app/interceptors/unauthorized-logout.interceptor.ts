import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthTokenService } from '../services/auth-token.service';

let clearing = false;

export const unauthorizedLogoutInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);
  const tokens = inject(AuthTokenService);
  const router = inject(Router);
  const base = environment.apiUrl.replace(/\/$/, '');
  const isApiRequest = req.url.startsWith(`${base}/api/`);
  const path = req.url.split(/[?#]/)[0] ?? '';
  const isLoginAttempt = path.endsWith('/api/public/login');

  return next(req).pipe(
    catchError((error: unknown) => {
      const unauthorized = error instanceof HttpErrorResponse && error.status === 401;

      if (
        unauthorized &&
        isApiRequest &&
        !isLoginAttempt &&
        isPlatformBrowser(platformId) &&
        !clearing
      ) {
        clearing = true;
        tokens.clear();
        void router.navigate(['/login']).finally(() => {
          clearing = false;
        });
      }

      return throwError(() => error);
    })
  );
};
