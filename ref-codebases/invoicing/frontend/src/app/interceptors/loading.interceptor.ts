import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { LoadingService } from '../services/loading.service';

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loader = inject(LoadingService);

  const base = environment.apiUrl.replace(/\/$/, '');
  const path = req.url.split(/[?#]/)[0] ?? '';

  const isApiCall = path.startsWith(`${base}/api/`);
  if (!isApiCall) {
    return next(req);
  }

  loader.start();
  return next(req).pipe(finalize(() => loader.stop()));
};

