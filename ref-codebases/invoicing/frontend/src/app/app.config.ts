import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { providePrimeNG } from 'primeng/config';
import { axisAuraPreset } from './theme/axis-aura.preset';
import { authTokenInterceptor } from './interceptors/auth-token.interceptor';
import { loadingInterceptor } from './interceptors/loading.interceptor';
import { unauthorizedLogoutInterceptor } from './interceptors/unauthorized-logout.interceptor';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(
      withFetch(),
      withInterceptors([loadingInterceptor, authTokenInterceptor, unauthorizedLogoutInterceptor])
    ),
    providePrimeNG({
      theme: {
        preset: axisAuraPreset,
      },
    }),
  ],
};
