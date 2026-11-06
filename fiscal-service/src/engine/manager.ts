/**
 * One engine per registered device, created on first use and kept for the life of the process.
 * The registry holds the certificate and key; the manager turns that into a running DeviceEngine.
 */
import type { Db } from "mongodb";

import type { Transport } from "../core/transport.js";
import { DeviceRegistry, RegistryError } from "../devices/registry.js";
import { NodeTransport } from "../node/transport.js";
import { DeviceEngine, type Alert, type EngineOptions } from "./engine.js";

export interface ManagerDeps {
  db: Db;
  registry: DeviceRegistry;
  /** Overrides the ZIMRA host and transport (tests). Production uses mutual TLS with the device's certificate. */
  baseUrl?: string;
  transportFor?: (identity: { certificatePem: string; privateKeyPem: string }) => Transport;
  options?: Partial<EngineOptions>;
  alert?: (a: Alert) => void;
  backgroundMs?: number;
}

export class EngineManager {
  private readonly engines = new Map<string, Promise<DeviceEngine>>();
  private readonly stops: (() => void)[] = [];

  constructor(private readonly deps: ManagerDeps) {}

  /** The running engine for a registered device (its registry id), starting it if needed. */
  get(id: string): Promise<DeviceEngine> {
    let p = this.engines.get(id);
    if (!p) {
      p = this.start(id);
      this.engines.set(id, p);
      // A failed start must not be cached: the next call tries again.
      p.catch(() => this.engines.delete(id));
    }
    return p;
  }

  private async start(id: string): Promise<DeviceEngine> {
    const ident = await this.deps.registry.identity(id); // throws if unknown or switched off
    const { config } = await this.deps.registry.engineConfig(id);
    const transport = this.deps.transportFor ? this.deps.transportFor(ident) : new NodeTransport({ certificatePem: ident.certificatePem, privateKeyPem: ident.privateKeyPem });
    const engine = new DeviceEngine({
      db: this.deps.db,
      deviceKey: id,
      identity: { deviceId: ident.deviceId, serialNumber: ident.serialNumber, privateKeyPem: ident.privateKeyPem },
      transport,
      baseUrl: this.deps.baseUrl,
      environment: ident.environment,
      configSnapshot: config ? { qrUrl: config.qrUrl, vatPayer: !!config.vatNumber, taxes: (config.applicableTaxes as { taxID: number; taxPercent: number | null }[] | undefined)?.map((t) => ({ taxID: t.taxID, taxPercent: t.taxPercent ?? null })) } : undefined,
      options: this.deps.options,
      alert: this.deps.alert,
    });
    await engine.init();
    this.stops.push(engine.startBackground(this.deps.backgroundMs ?? 2_000));
    return engine;
  }

  /** Start an engine for every active device (so queued receipts resume sending after a restart). */
  async startAll(): Promise<{ started: number; failed: { id: string; message: string }[] }> {
    const failed: { id: string; message: string }[] = [];
    let started = 0;
    for (const d of await this.deps.registry.list()) {
      if (!d.active) continue;
      try {
        await this.get(d.id);
        started++;
      } catch (e) {
        failed.push({ id: d.id, message: e instanceof Error ? e.message : String(e) });
      }
    }
    return { started, failed };
  }

  /** Drop a device's engine (after its certificate was replaced or it was switched off). */
  async release(id: string): Promise<void> {
    const p = this.engines.get(id);
    this.engines.delete(id);
    if (p) await (await p.catch(() => undefined))?.shutdown();
  }

  async shutdown(): Promise<void> {
    for (const s of this.stops) s();
    await Promise.all([...this.engines.keys()].map((id) => this.release(id)));
  }
}

export { RegistryError };
