import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/** Aura preset with Axis brand red as the primary semantic palette (buttons, focus rings, highlights). */
export const axisAuraPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fef2f2',
      100: '#fee2e2',
      200: '#fecaca',
      300: '#fca5a5',
      400: '#f87171',
      500: '#dc2626',
      600: '#bc0515',
      700: '#9a0411',
      800: '#7a0d10',
      900: '#5c0a0c',
      950: '#3d0608',
    },
  },
});
