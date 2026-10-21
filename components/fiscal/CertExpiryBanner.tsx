import Link from "next/link";

import logger from "@/lib/logger";
import { getCertExpiryReports } from "@/lib/services/fiscalCertExpiry.service";
import { isEncryptionConfigured } from "@/lib/security/secretBox";

type Notice = { tone: "danger" | "warn"; title: string; detail: string };

/** Admin-only notice about each ZIMRA device certificate and how its private key is stored. */
export default async function CertExpiryBanner() {
  const notices: Notice[] = [];
  try {
    const reports = await getCertExpiryReports();
    const encryptionConfigured = isEncryptionConfigured();

    for (const expiry of reports) {
      if (!expiry.hasCertificate) continue;
      // With several devices the notice must say which one it is about.
      const who = reports.length > 1 ? ` (${expiry.name})` : "";
      const date = expiry.notAfter?.toISOString().slice(0, 10);
      if (expiry.status === "expired") {
        notices.push({
          tone: "danger",
          title: `Fiscal device certificate has expired${who}`,
          detail: `It expired on ${date}. ZIMRA rejects every request, so no receipts can be fiscalised until a new one is installed.`,
        });
      } else if (expiry.status === "critical" || expiry.status === "warning") {
        notices.push({
          tone: expiry.status === "critical" ? "danger" : "warn",
          title: `Fiscal device certificate expires in ${expiry.daysLeft} day${expiry.daysLeft === 1 ? "" : "s"}${who}`,
          detail: `Valid until ${date}. Renew it before then; after that date fiscal receipts stop.`,
        });
      }
      if (!expiry.secretsEncrypted) {
        notices.push({
          tone: "warn",
          title: `Device private key is stored unencrypted${who}`,
          detail: encryptionConfigured
            ? "Run npm run fiscal:encrypt -- --apply to encrypt it."
            : "Set FISCAL_ENCRYPTION_KEY, then run npm run fiscal:encrypt -- --apply.",
        });
      }
    }
  } catch (e) {
    // A banner problem must never take down the admin app.
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "Cert expiry banner failed");
  }

  if (!notices.length) return null;

  return (
    <div className="flex flex-col gap-2 px-4 pt-4 lg:px-6">
      {notices.map((n) => (
        <div
          key={n.title}
          role={n.tone === "danger" ? "alert" : "status"}
          className={
            n.tone === "danger"
              ? "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-red-900"
              : "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
          }
        >
          <p className="text-sm">
            <span className="font-semibold">{n.title}.</span> {n.detail}
          </p>
          <Link href="/fiscal-settings" className="text-sm font-medium underline underline-offset-2">
            Fiscal settings
          </Link>
        </div>
      ))}
    </div>
  );
}
