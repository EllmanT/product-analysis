import { fiscalBackend, listAlerts, type ServiceAlert } from "@/lib/fiscal/client";
import logger from "@/lib/logger";
import { sendFiscalAlertOnce } from "@/lib/services/fiscalAlerts.service";

const SUBJECTS: Record<string, string> = {
  CLOSE_FAILED: "Fiscal day close failed",
  CLOSE_BLOCKED: "Fiscal day close is blocked",
  CLOSE_REFUSED: "ZIMRA refused the fiscal day close",
  RED_RECEIPT: "A receipt was flagged Red by ZIMRA (the day cannot close by itself)",
  GRAY_RECEIPT: "A receipt was flagged Gray by ZIMRA",
  RECEIPT_REFUSED: "ZIMRA refused a receipt",
  CERT_REJECTED: "ZIMRA rejected the device certificate",
  COUNTERS_REBUILT: "Fiscal day counters were rebuilt",
  DAY_STATE_UNKNOWN: "The fiscal day state is unknown",
  LEASE_LOST: "A second fiscal service instance took over the device",
};

/** Email once per service alert record (device + kind + day). The key makes a repeat the same day a no-op. */
export async function emailServiceAlert(a: ServiceAlert): Promise<boolean> {
  const subject = `${SUBJECTS[a.kind] ?? a.kind} (device ${a.deviceKey})`;
  const text = [
    a.message,
    "",
    `Kind: ${a.kind}`,
    `Device: ${a.deviceKey}`,
    `Day: ${a.day}`,
    `Happened ${a.count} time${a.count === 1 ? "" : "s"}, first at ${a.firstAt}, last at ${a.lastAt}.`,
    "",
    "Open Admin > Fiscal Day to see the device and acknowledge the alert.",
  ].join("\n");
  return sendFiscalAlertOnce(`svc:${a.id}`, subject, text);
}

/** Called from the minute cron. Never throws. Returns how many alert emails went out. */
export async function pullServiceAlerts(): Promise<{ open: number; emailed: number }> {
  if (fiscalBackend() !== "service") return { open: 0, emailed: 0 };
  try {
    const open = await listAlerts(true);
    let emailed = 0;
    for (const a of open) if (await emailServiceAlert(a)) emailed++;
    return { open: open.length, emailed };
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "Could not read alerts from the fiscal service");
    return { open: 0, emailed: 0 };
  }
}
