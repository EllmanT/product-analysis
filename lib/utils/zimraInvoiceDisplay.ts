import type { IFiscalData } from "@/database/invoice.model";

/** Subset of fiscal payload used for QR / verification display (avoids requiring e.g. `rawResponse` on client DTOs). */
export type ZimraQrFiscalFields = Pick<
  IFiscalData,
  "verificationCode" | "verificationLink" | "qrCodeUrl" | "receiptHash"
>;

/** True only after a successful ZIMRA submit (guards stale flags / accidental SUBMITTED). */
export function isInvoiceZimraVerifiedForDisplay(inv: {
  isFiscalized?: boolean;
  fiscalStatus?: string;
  fiscalSubmittedAt?: Date | string | null | undefined;
}): boolean {
  return (
    inv.isFiscalized === true &&
    inv.fiscalStatus === "SUBMITTED" &&
    inv.fiscalSubmittedAt != null &&
    String(inv.fiscalSubmittedAt).length > 0
  );
}

/** Host-only ZIMRA URLs (e.g. GetConfig) are not receipt-specific verification links. */
export function isBareZimraPortalUrl(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    if (!/zimra\.co\.zw$/i.test(u.hostname)) return false;
    const path = u.pathname.replace(/\/$/, "") || "/";
    return path === "/" && !u.search;
  } catch {
    return false;
  }
}

/**
 * String to encode in the QR code: prefer a full verification URL over a generic portal root.
 */
export function getZimraQrEmbedString(
  fiscalData: Partial<ZimraQrFiscalFields> | null | undefined
): string {
  if (!fiscalData) return "";
  const link = (fiscalData.verificationLink || "").trim();
  const qrUrl = (fiscalData.qrCodeUrl || "").trim();
  const hash = (fiscalData.receiptHash || "").trim();
  const code = (fiscalData.verificationCode || "").trim();

  if (link && !isBareZimraPortalUrl(link)) return link;
  if (qrUrl && /^https?:\/\//i.test(qrUrl) && !isBareZimraPortalUrl(qrUrl)) return qrUrl;
  if (link && code) return link;
  if (link) return link;
  if (qrUrl && /^https?:\/\//i.test(qrUrl)) return qrUrl;
  if (hash) return hash;
  if (qrUrl) return qrUrl;
  return "";
}
