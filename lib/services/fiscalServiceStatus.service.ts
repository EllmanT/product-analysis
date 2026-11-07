/**
 * FISCAL_BACKEND=service: what the Fiscal day page needs to know about a device, read through the fiscal service
 * (ZIMRA's own GetStatus plus the service's queue), never through a Virtual Device.
 */
import { engineStatus, FiscalServiceUnavailable, serviceDeviceStatus } from "@/lib/fiscal/client";
import { resolveDeviceByKey, resolveServiceDeviceId } from "@/lib/services/fiscalDevice.service";
import type { DeviceHealth } from "@/lib/services/zimraPosDevice.service";

export interface ServiceDayState {
  isOpen: boolean;
  status: string;
  device: DeviceHealth;
  deviceKey: string;
  deviceName: string;
}

export async function getServiceDayState(deviceKey?: string): Promise<ServiceDayState> {
  const target = await resolveDeviceByKey(deviceKey); // names the device; makes no network call
  const sid = await resolveServiceDeviceId(deviceKey);
  const [live, engine] = await Promise.allSettled([serviceDeviceStatus(sid), engineStatus(sid)]);

  // The fiscal service itself being down is a device problem the admin must see, not a 500.
  const serviceDown = live.status === "rejected" && live.reason instanceof FiscalServiceUnavailable;
  const eng = engine.status === "fulfilled" ? engine.value : null;

  if (live.status === "rejected") {
    const message = serviceDown ? "The fiscal service is not reachable." : live.reason instanceof Error ? live.reason.message : "ZIMRA did not answer for this device.";
    return {
      isOpen: eng?.dayOpen ?? false,
      status: "Unknown",
      deviceKey: target.key,
      deviceName: target.name,
      device: { reachable: false, dayOpen: eng?.dayOpen ?? null, fiscalDayNo: eng?.fiscalDayNo ?? null, uploadBacklog: eng?.unsent ?? null, message },
    };
  }

  const s = live.value;
  const status = String(s["fiscalDayStatus"] ?? "Unknown");
  const isOpen = status === "FiscalDayOpened" || status === "FiscalDayCloseFailed";
  const closingErrorCode = typeof s["fiscalDayClosingErrorCode"] === "string" ? (s["fiscalDayClosingErrorCode"] as string) : undefined;
  return {
    isOpen,
    status,
    deviceKey: target.key,
    deviceName: target.name,
    device: {
      reachable: true,
      dayOpen: isOpen,
      dayStatus: status as DeviceHealth["dayStatus"],
      closingErrorCode: closingErrorCode as DeviceHealth["closingErrorCode"],
      fiscalDayNo: typeof s["lastFiscalDayNo"] === "number" ? (s["lastFiscalDayNo"] as number) : (eng?.fiscalDayNo ?? null),
      uploadBacklog: eng?.unsent ?? null,
      message: eng?.paused ? `The service has paused this device: ${eng.paused}` : eng?.lastError,
    },
  };
}

const healthCache = new Map<string, { at: number; value: { reachable: boolean; dayOpen: boolean | null; fiscalDayNo: number | null; message?: string } }>();

/**
 * The till polls this after every sale, so ZIMRA is asked at most once every 15 seconds per device and never for
 * longer than 8 seconds. A slow ZIMRA must not slow the till; it shows "not connected" instead.
 */
export async function getServiceDeviceHealth(deviceKey?: string): Promise<{ reachable: boolean; dayOpen: boolean | null; fiscalDayNo: number | null; message?: string }> {
  const sid = await resolveServiceDeviceId(deviceKey);
  const hit = healthCache.get(sid);
  if (hit && Date.now() - hit.at < 15_000) return hit.value;
  let value: { reachable: boolean; dayOpen: boolean | null; fiscalDayNo: number | null; message?: string };
  try {
    const s = await Promise.race([
      serviceDeviceStatus(sid),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("ZIMRA did not answer in time")), 8_000)),
    ]);
    const status = String(s["fiscalDayStatus"] ?? "");
    value = {
      reachable: true,
      dayOpen: status === "FiscalDayOpened" || status === "FiscalDayCloseFailed",
      fiscalDayNo: typeof s["lastFiscalDayNo"] === "number" ? (s["lastFiscalDayNo"] as number) : null,
    };
  } catch (e) {
    value = { reachable: false, dayOpen: null, fiscalDayNo: null, message: e instanceof Error ? e.message : "Device not reachable" };
  }
  healthCache.set(sid, { at: Date.now(), value });
  return value;
}
