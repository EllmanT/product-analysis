/* Polyfill for Auth0 SDK and document during SSR/prerender */
if (typeof globalThis.window === 'undefined') {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}
if (typeof globalThis.location === 'undefined') {
  (globalThis as unknown as { location: { href: string; origin: string; pathname: string; search: string } }).location = {
    href: 'http://localhost:4200/',
    origin: 'http://localhost:4200',
    pathname: '/',
    search: '',
  };
}
if (typeof globalThis.document === 'undefined') {
  (globalThis as unknown as { document: any }).document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ setAttribute: () => {}, style: {} }),
    body: { appendChild: () => {}, removeChild: () => {} },
    documentElement: { style: {} },
  };
}

import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { config } from './app/app.config.server';

const bootstrap = (context: BootstrapContext) =>
    bootstrapApplication(App, config, context);

export default bootstrap;
