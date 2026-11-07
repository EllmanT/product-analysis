"use client";

import { useEffect, useState } from "react";

import { Label } from "@/components/ui/label";
import type { FiscalDeviceSafe } from "@/lib/services/fiscalDevice.service";

/** The central device's key in every deviceKey parameter. */
export const CENTRAL = "central";

/** Branch fiscal devices for admin screens. `loaded` is false until the first answer arrives. */
export function useFiscalDevices(reloadKey = 0) {
  const [devices, setDevices] = useState<FiscalDeviceSafe[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [encryptionConfigured, setEncryptionConfigured] = useState(true);
  const [backend, setBackend] = useState<"legacy" | "service">("legacy");

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/fiscal-devices", { cache: "no-store" });
        const j = await r.json();
        if (!ignore && j.success) {
          setDevices(j.data);
          setEncryptionConfigured(j.meta?.encryptionConfigured !== false);
          setBackend(j.meta?.backend === "service" ? "service" : "legacy");
        }
      } finally {
        if (!ignore) setLoaded(true);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  return { devices, loaded, encryptionConfigured, backend };
}

const selectClass =
  "h-9 min-w-56 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40";

/**
 * Picks the central device or one of the branch devices. Renders nothing while there are no branch
 * devices, so installs with a single shared device see no change.
 */
export function DeviceSelect({
  value,
  onChange,
  label = "Fiscal device",
  disabled,
  activeOnly,
  allLabel,
}: {
  value: string;
  onChange: (key: string) => void;
  label?: string;
  disabled?: boolean;
  /** Hide switched-off devices (for choosing where a branch should sell). */
  activeOnly?: boolean;
  /** When set, adds an option with value "" (for filters), e.g. "All devices". */
  allLabel?: string;
}) {
  const { devices, loaded } = useFiscalDevices();
  if (!loaded || devices.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="fiscal-device">{label}</Label>
      <select id="fiscal-device" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {allLabel && <option value="">{allLabel}</option>}
        <option value={CENTRAL}>Central device</option>
        {devices
          .filter((d) => !activeOnly || d.active || d.id === value)
          .map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.active ? "" : " (off)"}
            </option>
          ))}
      </select>
    </div>
  );
}
