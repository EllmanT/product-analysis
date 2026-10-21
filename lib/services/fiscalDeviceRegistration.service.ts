import { certMatchesKey, parseCertPem } from "@/lib/fiscalCertInfo";
import { deviceCommonName, generateCsr, parseDeviceCommonName } from "@/lib/fiscalCsr";
import { encryptSecret, isEncryptionConfigured } from "@/lib/security/secretBox";
import { hasCertificate, secretCtx } from "@/lib/services/fiscalCertStore";
import {
  RenewalError,
  acquireLock,
  installPending,
  loadDoc,
  loadTarget,
  releaseLock,
} from "@/lib/services/fiscalCertTarget";
import { assertDeviceIdFree } from "@/lib/services/fiscalDevice.service";
import { recordCertEvent, type CertActor } from "@/lib/services/fiscalSettings.service";
import { gatewayBase, gatewayCall, gatewayModel, gatewayProblem } from "@/lib/zimraGateway";

/**
 * Onboarding a new ZIMRA device (or recovering one whose certificate has expired) with the device ID and
 * activation key ZIMRA issued on the registration portal.
 *
 * The activation key is a credential: it is used for the one request that needs it and is never stored,
 * logged, audited or echoed in an error message.
 */

export interface RegistrationInput {
  deviceId: string;
  /** The fiscal device serial assigned by the manufacturer (goes into the certificate's CN). */
  serial: string;
  activationKey: string;
}

export interface TaxpayerSummary {
  taxPayerName: string;
  taxPayerTIN: string;
  vatNumber: string | null;
  deviceBranchName: string;
  address: string;
}

/** Plain validation messages, safe to show. The activation key itself is never included. */
function checkInput(i: RegistrationInput, needKey = true) {
  if (!/^\d{1,10}$/.test(i.deviceId.trim())) throw new RenewalError("The device ID is the number ZIMRA gave you (digits only)");
  const serial = i.serial.trim();
  if (!serial || serial.length > 20 || !/^[\w.\- :]+$/.test(serial)) {
    throw new RenewalError("The device serial number is required (up to 20 characters)");
  }
  if (needKey && !/^[A-Za-z0-9]{8}$/.test(i.activationKey.trim())) {
    throw new RenewalError("The activation key is 8 letters or digits");
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Ask ZIMRA which taxpayer and branch this device and activation key belong to, so an administrator can
 * confirm it before registering. Changes nothing; the key is not used up.
 */
export async function verifyTaxpayer(key: string, input: RegistrationInput): Promise<TaxpayerSummary> {
  checkInput(input);
  const t = await loadTarget(key);
  const doc = await loadDoc(t);
  const res = await gatewayCall({
    base: gatewayBase(doc.zimraUseProductionUrl),
    path: `/Public/v1/${encodeURIComponent(input.deviceId.trim())}/VerifyTaxpayerInformation`,
    method: "POST",
    body: { activationKey: input.activationKey.trim(), deviceSerialNo: input.serial.trim() },
    tls: null,
    model: gatewayModel(doc),
  });
  if (res.status !== 200 || !res.json) {
    throw new RenewalError(`ZIMRA could not verify these details (HTTP ${res.status}: ${gatewayProblem(res)})`);
  }
  const a = (res.json.deviceBranchAddress ?? {}) as Record<string, unknown>;
  return {
    taxPayerName: str(res.json.taxPayerName),
    taxPayerTIN: str(res.json.taxPayerTIN),
    vatNumber: str(res.json.vatNumber) || null,
    deviceBranchName: str(res.json.deviceBranchName),
    address: [a.houseNo, a.street, a.city, a.province].map(str).filter(Boolean).join(", "),
  };
}

export interface RegistrationResult {
  key: string;
  name: string;
  newNotAfter: Date;
  resumed: boolean;
}

/**
 * Register the device and install its first certificate.
 *
 *  1. Refuses when a still-valid certificate exists (renew it instead). An expired one may be replaced.
 *  2. New key + CSR (CN ZIMRA-<serial>-<10-digit id>); the key is stored encrypted BEFORE the request, so a
 *     certificate ZIMRA issues can never be lost to a crash.
 *  3. RegisterDevice (no certificate needed: the activation key is the credential).
 *  4. The reply is checked (right device, matches our key) and tested with ZIMRA over mTLS (GetConfig)
 *     before it is installed. If that test fails the pair stays pending and `resumeRegistration` finishes it
 *     without needing the activation key again.
 */
export async function registerDevice(
  key: string,
  input: RegistrationInput,
  opts: { actor?: CertActor } = {}
): Promise<RegistrationResult> {
  if (!isEncryptionConfigured()) {
    throw new RenewalError("FISCAL_ENCRYPTION_KEY is not set; refusing to create a private key that cannot be stored encrypted");
  }
  checkInput(input);
  const deviceId = input.deviceId.trim();
  const serial = input.serial.trim();

  const t = await loadTarget(key);
  await assertDeviceIdFree(key, deviceId).catch((e) => {
    throw new RenewalError(e instanceof Error ? e.message : String(e));
  });
  await acquireLock(t);
  const ctx = secretCtx(t.scope);

  try {
    const doc = await loadDoc(t);

    if (hasCertificate(doc) && doc.certNotAfter && doc.certNotAfter.getTime() > Date.now()) {
      throw new RenewalError("This device already has a valid certificate. Use renewal instead of registering again.");
    }
    if (doc.pendingCertPem?.trim() && doc.pendingKeyPem) {
      throw new RenewalError("ZIMRA already issued a certificate for this device that is waiting to be tested. Finish that registration instead.");
    }

    const base = gatewayBase(doc.zimraUseProductionUrl);
    const model = gatewayModel(doc);
    await t.model.updateOne({ _id: t.id }, { $set: { lastRenewalAttemptAt: new Date() } });

    const { csrPem, keyPem } = generateCsr(serial, deviceId);
    await t.model.updateOne({ _id: t.id }, { $set: { pendingKeyPem: encryptSecret(keyPem, ctx.pendingKey), pendingCertPem: "" } });

    const res = await gatewayCall({
      base,
      path: `/Public/v1/${encodeURIComponent(deviceId)}/RegisterDevice`,
      method: "POST",
      body: { activationKey: input.activationKey.trim(), certificateRequest: csrPem },
      tls: null,
      model,
    });
    if (res.status !== 200 || typeof res.json?.certificate !== "string") {
      throw new RenewalError(`ZIMRA did not register the device (HTTP ${res.status}: ${gatewayProblem(res)})`);
    }
    const newCert = res.json.certificate;

    const issued = parseCertPem(newCert);
    const who = parseDeviceCommonName(issued.subject);
    if (who?.deviceId !== deviceId || issued.subject.indexOf(deviceCommonName(serial, deviceId)) === -1) {
      throw new RenewalError("ZIMRA returned a certificate for a different device; it was not installed");
    }
    if (!certMatchesKey(newCert, keyPem)) throw new RenewalError("ZIMRA's certificate does not match the new key; it was not installed");
    await t.model.updateOne({ _id: t.id }, { $set: { pendingCertPem: newCert } });

    const { newNotAfter } = await installPending(t, {
      deviceId,
      base,
      model,
      newCert,
      action: "register",
      identity: { deviceId, serial },
      actor: opts.actor,
      resumed: false,
      label: t.name,
    });
    return { key, name: t.name, newNotAfter, resumed: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await t.model.updateOne({ _id: t.id }, { $set: { lastRenewalError: message.slice(0, 500) } }).catch(() => undefined);
    await recordCertEvent("register_failed", opts.actor, { detail: `${t.name}: ${message}`.slice(0, 300) });
    throw e instanceof RenewalError ? e : new RenewalError(message);
  } finally {
    await releaseLock(t).catch(() => undefined);
  }
}

/** Finish a registration whose certificate ZIMRA already issued but that failed its test call. No activation key needed. */
export async function resumeRegistration(key: string, opts: { actor?: CertActor } = {}): Promise<RegistrationResult> {
  const t = await loadTarget(key);
  await acquireLock(t);
  try {
    const doc = await loadDoc(t);
    const newCert = doc.pendingCertPem?.trim() || "";
    if (!newCert || !doc.pendingKeyPem) throw new RenewalError("There is no pending registration to finish");
    if (hasCertificate(doc) && doc.certNotAfter && doc.certNotAfter.getTime() > Date.now()) {
      throw new RenewalError("This device already has a valid certificate; the pending one belongs to a renewal. Finish the renewal instead.");
    }
    const who = parseDeviceCommonName(parseCertPem(newCert).subject);
    if (!who) throw new RenewalError("The pending certificate is not in ZIMRA's device format and was left untouched");

    const { newNotAfter } = await installPending(t, {
      deviceId: who.deviceId,
      base: gatewayBase(doc.zimraUseProductionUrl),
      model: gatewayModel(doc),
      newCert,
      action: "register",
      identity: { deviceId: who.deviceId, serial: who.serial },
      actor: opts.actor,
      resumed: true,
      label: t.name,
    });
    return { key, name: t.name, newNotAfter, resumed: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await t.model.updateOne({ _id: t.id }, { $set: { lastRenewalError: message.slice(0, 500) } }).catch(() => undefined);
    throw e instanceof RenewalError ? e : new RenewalError(message);
  } finally {
    await releaseLock(t).catch(() => undefined);
  }
}
