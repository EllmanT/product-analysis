/**
 * FISCAL_BACKEND=service: keeping the app's device records in step with the fiscal service, and choosing which
 * device is the central one. The service holds the certificate and key it signs with; the app keeps the device's
 * name, its branches and the service's id for it.
 */
import { Types } from "mongoose";

import FiscalDevice from "@/database/fiscalDevice.model";
import PosSale from "@/database/posSale.model";
import {
  FiscalServiceRefused,
  engineStatus,
  getServiceDevice,
  listServiceDevices,
  registerServiceDevice,
  replaceServiceCertificate,
  serviceDeviceStatus,
  type ServiceDevice,
} from "@/lib/fiscal/client";
import dbConnect from "@/lib/mongoose";
import { DeviceConfigError, getCentralDeviceId, getFiscalDeviceSafe, resolveServiceDeviceId, saveDeviceIdentity, setCentralDeviceId } from "@/lib/services/fiscalDevice.service";

async function load(id: string) {
  await dbConnect();
  const doc = Types.ObjectId.isValid(id) ? await FiscalDevice.findById(id) : null;
  if (!doc) throw new DeviceConfigError("Fiscal device not found");
  return doc;
}

async function remember(id: string, svc: ServiceDevice): Promise<void> {
  await saveDeviceIdentity(id, String(svc.deviceId), svc.serialNumber);
  await FiscalDevice.updateOne({ _id: id }, { $set: { serviceDeviceId: svc.id } });
}

/**
 * Give the service this device's certificate and key. The service checks them with ZIMRA before it stores
 * anything, so a certificate ZIMRA refuses is refused here with ZIMRA's reason and nothing is saved.
 * Safe to repeat: a device the service already holds is updated, never added twice.
 */
export async function pushCertificateToService(id: string, certificatePem: string, privateKeyPem: string): Promise<ServiceDevice> {
  const doc = await load(id);
  let svc: ServiceDevice;
  const known = doc.serviceDeviceId?.trim();
  if (known && (await getServiceDevice(known))) {
    svc = await replaceServiceCertificate(known, certificatePem, privateKeyPem);
  } else {
    try {
      svc = await registerServiceDevice({ name: doc.name, certificatePem, privateKeyPem, environment: doc.zimraUseProductionUrl ? "production" : "test" });
    } catch (e) {
      // "Device N is already registered": a retry after a half-finished earlier attempt, or the same device on another record.
      const n = e instanceof FiscalServiceRefused && e.status === 409 ? /Device (\d+) is already registered/.exec(e.message)?.[1] : undefined;
      const existing = n ? (await listServiceDevices()).find((d) => String(d.deviceId) === n) : undefined;
      if (!existing) throw e;
      const owner = await FiscalDevice.findOne({ serviceDeviceId: existing.id, _id: { $ne: doc._id } }).select("name");
      if (owner) throw new DeviceConfigError(`Device ${n} is already added as "${owner.name}".`);
      svc = await replaceServiceCertificate(existing.id, certificatePem, privateKeyPem);
    }
  }
  await remember(id, svc);
  return svc;
}

/** The "check the connection" step for a service device: ZIMRA must answer GetStatus for it, using its certificate. */
export async function verifyDeviceViaService(id: string) {
  const doc = await load(id);
  const sid = doc.serviceDeviceId?.trim();
  if (!sid) throw new DeviceConfigError("This device has no certificate yet. Add its certificate first.");
  const svc = await getServiceDevice(sid);
  if (!svc) throw new DeviceConfigError("The fiscal service does not know this device. Add its certificate again.");
  const status = await serviceDeviceStatus(sid);
  await remember(id, svc);
  return { config: status, device: (await getFiscalDeviceSafe(id))! };
}

/**
 * Make a device the central one. Refused unless the current central device is clean: its fiscal day closed and
 * no sale waiting, because those sales are filed under "central" and would otherwise go out through the new device.
 */
export async function setCentralDevice(id: string | null): Promise<void> {
  await dbConnect();
  const currentId = await getCentralDeviceId();
  if (id && id === currentId) return;

  if (id) {
    const next = await load(id);
    if (!next.active) throw new DeviceConfigError("That device is switched off");
    if (!next.serviceDeviceId?.trim()) throw new DeviceConfigError("Add this device's certificate before making it central");
  }

  // Anything to protect only exists when a central device is already working.
  let current: string | null = null;
  try {
    current = await resolveServiceDeviceId("central");
  } catch {
    current = null;
  }
  if (current) {
    const waiting = await PosSale.countDocuments({
      $or: [{ fiscalDeviceKey: "central" }, { fiscalDeviceKey: { $exists: false } }, { fiscalDeviceKey: null }],
      isTest: { $ne: true },
      status: { $in: ["PENDING", "SUBMITTING", "UNFISCALISED", "UNKNOWN"] },
    });
    if (waiting > 0) throw new DeviceConfigError(`${waiting} sale(s) are still waiting for a fiscal receipt on the current central device. Let them go through first.`);
    const e = await engineStatus(current);
    if (e.dayOpen) throw new DeviceConfigError("The current central device still has a fiscal day open. Close it first (Fiscal day), then switch.");
    if (e.unsent > 0) throw new DeviceConfigError(`The current central device still has ${e.unsent} receipt(s) to send to ZIMRA.`);
  }

  await setCentralDeviceId(id);
}
