import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private inflight = signal(0);

  readonly isLoading = signal(false);

  start(): void {
    this.inflight.update((n) => n + 1);
    this.isLoading.set(this.inflight() > 0);
  }

  stop(): void {
    this.inflight.update((n) => Math.max(0, n - 1));
    this.isLoading.set(this.inflight() > 0);
  }

  reset(): void {
    this.inflight.set(0);
    this.isLoading.set(false);
  }
}

