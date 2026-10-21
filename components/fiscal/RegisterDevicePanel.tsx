"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TaxpayerSummary } from "@/lib/services/fiscalDeviceRegistration.service";

type Reply = { success: boolean; message?: string; taxpayer?: TaxpayerSummary };

/**
 * Register a device with ZIMRA using the device ID and activation key from the ZIMRA registration portal,
 * or recover one whose certificate has expired. Step 1 shows which taxpayer and branch ZIMRA has for the
 * details (nothing is used up); step 2 registers. The activation key is sent once and never stored.
 */
export default function RegisterDevicePanel({
  endpoint,
  initialDeviceId,
  initialSerial,
  pending,
  encryptionConfigured,
  expired,
  onDone,
}: {
  /** The register endpoint for the central device or one branch device. */
  endpoint: string;
  initialDeviceId?: string | null;
  initialSerial?: string | null;
  /** ZIMRA already issued a certificate that is waiting to be tested (finish it, no key needed). */
  pending: boolean;
  encryptionConfigured: boolean;
  /** The stored certificate has expired (so this is a re-registration). */
  expired: boolean;
  onDone: () => void;
}) {
  const [deviceId, setDeviceId] = useState(initialDeviceId ?? "");
  const [serial, setSerial] = useState(initialSerial ?? "");
  const [activationKey, setActivationKey] = useState("");
  const [taxpayer, setTaxpayer] = useState<TaxpayerSummary | null>(null);
  const [busy, setBusy] = useState<"" | "verify" | "register" | "resume">("");
  const [error, setError] = useState("");

  async function send(action: "verify" | "register" | "resume"): Promise<Reply> {
    setBusy(action);
    setError("");
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, deviceId, serial, activationKey }),
      });
      return ((await r.json().catch(() => null)) as Reply | null) ?? { success: false, message: `Request failed (${r.status})` };
    } catch {
      return { success: false, message: "Network error" };
    } finally {
      setBusy("");
    }
  }

  async function verify() {
    setTaxpayer(null);
    const res = await send("verify");
    if (!res.success || !res.taxpayer) return setError(res.message ?? "Could not verify");
    setTaxpayer(res.taxpayer);
  }

  async function finish(action: "register" | "resume") {
    const res = await send(action);
    if (!res.success) {
      setError(res.message ?? "Registration failed");
      onDone(); // a failed test leaves a pending certificate; refresh so "Finish" appears
      return;
    }
    setActivationKey("");
    setTaxpayer(null);
    toast.success(action === "resume" ? "Registration finished" : "Device registered");
    onDone();
  }

  const detailsOk = /^\d{1,10}$/.test(deviceId.trim()) && serial.trim().length > 0 && /^[A-Za-z0-9]{8}$/.test(activationKey.trim());

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">{expired ? "Register again with ZIMRA" : "Register with ZIMRA"}</p>
        <p className="text-xs text-muted-foreground">
          {expired
            ? "The certificate has expired, so it cannot be renewed. Registering again with the device ID and a new activation key from the ZIMRA portal issues a new one."
            : "Use the device ID and activation key from the ZIMRA registration portal. This creates the device's certificate."}
        </p>
      </div>

      {pending && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>ZIMRA already issued a certificate for this device that has not been installed yet. No activation key is needed to finish.</p>
          <Button type="button" size="sm" onClick={() => void finish("resume")} disabled={busy !== "" || !encryptionConfigured}>
            {busy === "resume" ? "Finishing…" : "Finish pending registration"}
          </Button>
        </div>
      )}

      {!pending && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="reg-id">Device ID</Label>
              <Input id="reg-id" inputMode="numeric" value={deviceId} onChange={(e) => (setDeviceId(e.target.value), setTaxpayer(null))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-serial">Device serial number</Label>
              <Input id="reg-serial" value={serial} maxLength={20} onChange={(e) => (setSerial(e.target.value), setTaxpayer(null))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-key">Activation key</Label>
              <Input
                id="reg-key"
                type="password"
                autoComplete="off"
                maxLength={8}
                value={activationKey}
                onChange={(e) => (setActivationKey(e.target.value), setTaxpayer(null))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">The activation key is sent to ZIMRA once and is never saved.</p>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => void verify()} disabled={!detailsOk || busy !== ""}>
              {busy === "verify" ? "Checking…" : "1. Check details with ZIMRA"}
            </Button>
          </div>

          {taxpayer && (
            <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950" role="status">
              <p className="font-medium">ZIMRA says this device belongs to:</p>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
                <dt className="font-medium">Taxpayer</dt>
                <dd>{taxpayer.taxPayerName}</dd>
                <dt className="font-medium">TIN</dt>
                <dd>{taxpayer.taxPayerTIN}</dd>
                {taxpayer.vatNumber && (
                  <>
                    <dt className="font-medium">VAT number</dt>
                    <dd>{taxpayer.vatNumber}</dd>
                  </>
                )}
                <dt className="font-medium">Branch</dt>
                <dd>{taxpayer.deviceBranchName}</dd>
                {taxpayer.address && (
                  <>
                    <dt className="font-medium">Address</dt>
                    <dd>{taxpayer.address}</dd>
                  </>
                )}
              </dl>
              <p className="text-xs">Only continue if this is the right taxpayer and branch.</p>
              <Button type="button" size="sm" onClick={() => void finish("register")} disabled={busy !== "" || !encryptionConfigured}>
                {busy === "register" ? "Registering…" : "2. Register this device"}
              </Button>
            </div>
          )}
        </>
      )}

      {!encryptionConfigured && (
        <p role="alert" className="text-xs text-amber-900">
          FISCAL_ENCRYPTION_KEY is not set on the server, so a certificate cannot be saved yet.
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
