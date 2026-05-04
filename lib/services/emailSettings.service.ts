import { z } from "zod";

import EmailSettings, { type IEmailSettingsDoc } from "@/database/emailSettings.model";
import { getBootstrapAdminEmailSet } from "@/lib/auth/bootstrap-admin";
import dbConnect from "@/lib/mongoose";

const emailSchema = z.string().email();

function collectDefaultRecipientEmails(): string[] {
  const set = new Set<string>();
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (adminEmail) set.add(adminEmail);
  for (const e of getBootstrapAdminEmailSet()) {
    if (e) set.add(e);
  }
  return [...set];
}

const DEFAULT_TOGGLES = {
  sendCustomerQuotationEmail: true,
  notifyAdminsNewQuotation: true,
  sendCustomerInvoiceEmail: true,
  notifyAdminsInvoiceSent: true,
};

export type EmailSettingsSafe = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpTlsImplicit: boolean;
  smtpUser: string | null;
  smtpPasswordIsSet: boolean;
  fromName: string | null;
  fromAddress: string | null;
  publicSiteUrl: string | null;
  sendCustomerQuotationEmail: boolean;
  notifyAdminsNewQuotation: boolean;
  sendCustomerInvoiceEmail: boolean;
  notifyAdminsInvoiceSent: boolean;
  adminQuotationRecipients: string[];
  adminInvoiceRecipients: string[];
  updatedAt?: Date;
};

/** Merge env SITE_URL / NEXT_PUBLIC_SITE_URL with optional DB override. */
export function resolvePublicSiteUrl(doc?: IEmailSettingsDoc | null): string {
  const fromDb = doc?.publicSiteUrl?.trim();
  if (fromDb) return fromDb.replace(/\/$/, "");
  return (
    (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "")
  );
}

function normalizeRecipients(list: unknown): string[] {
  const arr = Array.isArray(list) ? list : [];
  const dedup = new Set<string>();
  for (const raw of arr) {
    const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    const ok = emailSchema.safeParse(s);
    if (ok.success) dedup.add(ok.data);
  }
  return [...dedup];
}

/** Exported for transactional routes — same normalization as PATCH. */
export function sanitizeNotificationEmails(list: unknown): string[] {
  return normalizeRecipients(list);
}

function toSafe(doc: IEmailSettingsDoc): EmailSettingsSafe {
  const pw = doc.smtpPassword?.trim();
  return {
    smtpHost: doc.smtpHost?.trim() || null,
    smtpPort:
      typeof doc.smtpPort === "number" && Number.isFinite(doc.smtpPort) ? doc.smtpPort : null,
    smtpTlsImplicit: doc.smtpTlsImplicit === true,
    smtpUser: doc.smtpUser?.trim() || null,
    smtpPasswordIsSet: Boolean(pw && pw.length > 0),
    fromName: doc.fromName?.trim() || null,
    fromAddress: doc.fromAddress?.trim() || null,
    publicSiteUrl: doc.publicSiteUrl?.trim() || null,
    sendCustomerQuotationEmail: doc.sendCustomerQuotationEmail !== false,
    notifyAdminsNewQuotation: doc.notifyAdminsNewQuotation !== false,
    sendCustomerInvoiceEmail: doc.sendCustomerInvoiceEmail !== false,
    notifyAdminsInvoiceSent: doc.notifyAdminsInvoiceSent !== false,
    adminQuotationRecipients: normalizeRecipients(doc.adminQuotationRecipients),
    adminInvoiceRecipients: normalizeRecipients(doc.adminInvoiceRecipients),
    updatedAt: doc.updatedAt,
  };
}

export async function getEmailSettingsDoc(): Promise<IEmailSettingsDoc> {
  await dbConnect();
  let doc = await EmailSettings.findOne();
  if (!doc) {
    const defaults = collectDefaultRecipientEmails();
    doc = await EmailSettings.create({
      ...DEFAULT_TOGGLES,
      adminQuotationRecipients: defaults,
      adminInvoiceRecipients: defaults,
    });
  }
  return doc;
}

export async function getEmailSettingsSafe(): Promise<EmailSettingsSafe> {
  const doc = await getEmailSettingsDoc();
  return toSafe(doc);
}

export const patchEmailSettingsSchema = z.object({
  smtpHost: z.string().max(255).nullable().optional(),
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  smtpTlsImplicit: z.boolean().optional(),
  smtpUser: z.string().max(255).nullable().optional(),
  /** Empty string clears stored password; omit to leave unchanged. */
  smtpPassword: z.string().max(500).nullable().optional(),
  fromName: z.string().max(200).nullable().optional(),
  fromAddress: z
    .union([z.string().email().max(255), z.literal(""), z.null()])
    .optional(),
  publicSiteUrl: z
    .union([z.string().url().max(2048), z.literal(""), z.null()])
    .optional(),
  sendCustomerQuotationEmail: z.boolean().optional(),
  notifyAdminsNewQuotation: z.boolean().optional(),
  sendCustomerInvoiceEmail: z.boolean().optional(),
  notifyAdminsInvoiceSent: z.boolean().optional(),
  adminQuotationRecipients: z.array(z.string().email()).optional(),
  adminInvoiceRecipients: z.array(z.string().email()).optional(),
});

export async function patchEmailSettings(
  input: z.infer<typeof patchEmailSettingsSchema>
): Promise<EmailSettingsSafe> {
  await dbConnect();
  const doc = await getEmailSettingsDoc();

  if (input.smtpHost !== undefined) doc.smtpHost = input.smtpHost?.trim() ?? "";
  if (input.smtpPort !== undefined) doc.smtpPort = input.smtpPort ?? undefined;
  if (input.smtpTlsImplicit !== undefined) doc.smtpTlsImplicit = input.smtpTlsImplicit;
  if (input.smtpUser !== undefined) doc.smtpUser = input.smtpUser?.trim() ?? "";
  if (input.smtpPassword !== undefined) {
    const p = input.smtpPassword?.trim() ?? "";
    doc.smtpPassword = p;
  }
  if (input.fromName !== undefined) doc.fromName = input.fromName?.trim() ?? "";
  if (input.fromAddress !== undefined) doc.fromAddress = input.fromAddress?.trim() ?? "";
  if (input.publicSiteUrl !== undefined) doc.publicSiteUrl = input.publicSiteUrl?.trim() ?? "";
  if (input.sendCustomerQuotationEmail !== undefined)
    doc.sendCustomerQuotationEmail = input.sendCustomerQuotationEmail;
  if (input.notifyAdminsNewQuotation !== undefined)
    doc.notifyAdminsNewQuotation = input.notifyAdminsNewQuotation;
  if (input.sendCustomerInvoiceEmail !== undefined)
    doc.sendCustomerInvoiceEmail = input.sendCustomerInvoiceEmail;
  if (input.notifyAdminsInvoiceSent !== undefined)
    doc.notifyAdminsInvoiceSent = input.notifyAdminsInvoiceSent;
  if (input.adminQuotationRecipients !== undefined) {
    doc.adminQuotationRecipients = normalizeRecipients(input.adminQuotationRecipients);
  }
  if (input.adminInvoiceRecipients !== undefined) {
    doc.adminInvoiceRecipients = normalizeRecipients(input.adminInvoiceRecipients);
  }

  await doc.save();
  return toSafe(doc);
}
