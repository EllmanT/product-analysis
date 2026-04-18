import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthTokenService } from '../services/auth-token.service';

/** Guest home only: if the user already has a session, open the app dashboard instead. */
export const redirectAuthedToDashboardGuard: CanActivateFn = () => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return true;
  }

  const tokens = inject(AuthTokenService);
  const router = inject(Router);

  if (tokens.hasToken()) {
    return router.createUrlTree(['/dashboard']);
  }

  return true;
};
