import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthTokenService } from '../services/auth-token.service';

export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthTokenService).getToken();
  const base = environment.apiUrl.replace(/\/$/, '');
  const path = req.url.split(/[?#]/)[0] ?? '';

  if (token && path.startsWith(`${base}/api/`) && !path.includes('/api/public/')) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req);
};
