/**
 * One read of every fiscal device's day for the Fiscal day page and the Fiscal devices table.
 * Each device is asked in parallel and none can hold the others up: a slow or dead device shows as "unreachable".
 */
import { fiscalBackend } from "@/lib/fiscal/client";
import { dayStateOf, type DayState } from "@/lib/fiscal/dayState";
import { listFiscalDevices, resolveDeviceByKey } from "@/lib/services/fiscalDevice.service";
import { getDrainProgress } from "@/lib/services/fiscalDayControl.service";
import { getServiceDayState } from "@/lib/services/fiscalServiceStatus.service";
import { getFiscalDayStatus } from "@/lib/services/invoice.service";
import { getDeviceHealth, type DeviceHealth } from "@/lib/services/zimraPosDevice.service";

export interface DeviceDay {
  /** A FiscalDevice id, or "central" for the legacy shared device. */
  key: string;
  name: string;
  isCentral: boolean;
  active: boolean;
  state: DayState;
  fiscalDayNo: number | null;
  /** Receipts not yet uploaded to ZIMRA; null when unknown. */
  unsent: number | null;
  closingErrorCode?: string;
  message?: string;
  /** The close is sending waiting sales first: how many are done of how many. */
  closeProgress?: { sent: number; total: number } | null;
  checkedAt: string;
}

const PER_DEVICE_TIMEOUT_MS = 12_000;

async function readOne(key: string): Promise<{ isOpen: boolean; managed: boolean | null; device?: DeviceHealth }> {
  if (fiscalBackend() === "service") {
    const s = await getServiceDayState(key);
    return { isOpen: s.isOpen, managed: s.engineDayOpen, device: s.device };
  }
  const target = await resolveDeviceByKey(key);
  const [status, device] = await Promise.all([getFiscalDayStatus(key), getDeviceHealth(target)]);
  return { isOpen: status.isOpen, managed: true, device };
}

async function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("The device did not answer in time")), PER_DEVICE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getFiscalDayOverview(): Promise<DeviceDay[]> {
  const devices = await listFiscalDevices();
  const targets: { key: string; name: string; isCentral: boolean; active: boolean }[] = devices.map((d) => ({
    key: d.id,
    name: d.name,
    isCentral: d.isCentral,
    active: d.active,
  }));
  // Without the fiscal service the shared device is not in the list, so it gets a card of its own.
  if (fiscalBackend() !== "service") targets.unshift({ key: "central", name: "Central device", isCentral: true, active: true });

  return Promise.all(
    targets.map(async (t): Promise<DeviceDay> => {
      const checkedAt = new Date().toISOString();
      if (!t.active) {
        return { ...t, state: "closed", fiscalDayNo: null, unsent: null, message: "Switched off", checkedAt };
      }
      try {
        const { isOpen, managed, device } = await withTimeout(readOne(t.key));
        return {
          ...t,
          state: dayStateOf(isOpen, device, managed),
          fiscalDayNo: device?.fiscalDayNo ?? null,
          unsent: device?.uploadBacklog ?? null,
          closingErrorCode: device?.closingErrorCode,
          message: device?.message,
          closeProgress: await getDrainProgress(t.key).catch(() => null),
          checkedAt,
        };
      } catch (e) {
        return { ...t, state: "unreachable", fiscalDayNo: null, unsent: null, message: e instanceof Error ? e.message : "Device not reachable", checkedAt };
      }
    }),
  );
}
