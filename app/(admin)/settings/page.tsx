"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

type EmailSettingsPayload = {
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
};

function recipientsToText(list: string[]): string {
  return list.join("\n");
}

function parseRecipientsText(s: string): string[] {
  return s
    .split(/[\n,;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  /** Maps to smtpTlsImplicit in API. */
  const [smtpExplicitTls, setSmtpExplicitTls] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpPasswordWasSet, setSmtpPasswordWasSet] = useState(false);
  const [fromName, setFromName] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [publicSiteUrl, setPublicSiteUrl] = useState("");
  const [sendCustomerQuotationEmail, setSendCustomerQuotationEmail] = useState(true);
  const [notifyAdminsNewQuotation, setNotifyAdminsNewQuotation] = useState(true);
  const [sendCustomerInvoiceEmail, setSendCustomerInvoiceEmail] = useState(true);
  const [notifyAdminsInvoiceSent, setNotifyAdminsInvoiceSent] = useState(true);
  const [quotationRecipients, setQuotationRecipients] = useState("");
  const [invoiceRecipients, setInvoiceRecipients] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/email-settings");
      const json = (await res.json()) as {
        success: boolean;
        data?: EmailSettingsPayload;
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message ?? "Failed to load");
        return;
      }
      const d = json.data;
      setSmtpHost(d.smtpHost ?? "");
      setSmtpPort(d.smtpPort != null ? String(d.smtpPort) : "");
      setSmtpExplicitTls(d.smtpTlsImplicit === true);
      setSmtpUser(d.smtpUser ?? "");
      setSmtpPassword("");
      setSmtpPasswordWasSet(d.smtpPasswordIsSet);
      setFromName(d.fromName ?? "");
      setFromAddress(d.fromAddress ?? "");
      setPublicSiteUrl(d.publicSiteUrl ?? "");
      setSendCustomerQuotationEmail(d.sendCustomerQuotationEmail);
      setNotifyAdminsNewQuotation(d.notifyAdminsNewQuotation);
      setSendCustomerInvoiceEmail(d.sendCustomerInvoiceEmail);
      setNotifyAdminsInvoiceSent(d.notifyAdminsInvoiceSent);
      setQuotationRecipients(recipientsToText(d.adminQuotationRecipients ?? []));
      setInvoiceRecipients(recipientsToText(d.adminInvoiceRecipients ?? []));
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const qList = parseRecipientsText(quotationRecipients);
      const iList = parseRecipientsText(invoiceRecipients);
      for (const e of qList) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
          setError(`Invalid quotation recipient email: ${e}`);
          setSaving(false);
          return;
        }
      }
      for (const e of iList) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
          setError(`Invalid invoice recipient email: ${e}`);
          setSaving(false);
          return;
        }
      }

      const portNum = smtpPort.trim() ? parseInt(smtpPort.trim(), 10) : null;
      const body: Record<string, unknown> = {
        smtpHost: smtpHost.trim() || null,
        smtpPort: portNum != null && !Number.isNaN(portNum) ? portNum : null,
        smtpTlsImplicit: smtpExplicitTls,
        smtpUser: smtpUser.trim() || null,
        fromName: fromName.trim() || null,
        fromAddress: fromAddress.trim() ? fromAddress.trim() : null,
        publicSiteUrl: publicSiteUrl.trim() ? publicSiteUrl.trim() : null,
        sendCustomerQuotationEmail,
        notifyAdminsNewQuotation,
        sendCustomerInvoiceEmail,
        notifyAdminsInvoiceSent,
        adminQuotationRecipients: qList,
        adminInvoiceRecipients: iList,
      };
      if (smtpPassword.trim()) {
        body.smtpPassword = smtpPassword.trim();
      } else if (smtpPasswordWasSet && smtpPassword === "") {
        /** leave unchanged — do not send smtpPassword key */
      }

      const res = await fetch("/api/admin/email-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(typeof json.error?.message === "string" ? json.error.message : "Save failed");
        return;
      }
      setOk("Email settings saved.");
      setSmtpPassword("");
      await load();
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function clearSmtpPassword() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/admin/email-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smtpPassword: "" }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(typeof json.error?.message === "string" ? json.error.message : "Could not clear password");
        return;
      }
      setOk("Stored SMTP password cleared; env password will be used if set.");
      setSmtpPassword("");
      await load();
    } catch {
      setError("Could not clear password");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Outbound email (merged with server environment when a field is blank) and admin notification
          preferences.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {ok}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">SMTP and From</h2>
        <p className="mt-1 text-sm text-slate-500">
          Leave blank to use <code className="text-xs">EMAIL_*</code> / <code className="text-xs">SMTP_*</code>{" "}
          variables on the server.
        </p>
        <Separator className="my-4" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="smtpHost">SMTP host</Label>
            <Input
              id="smtpHost"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.example.com"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtpPort">SMTP port</Label>
            <Input
              id="smtpPort"
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
              placeholder="587"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch
              id="smtpExplicitTls"
              checked={smtpExplicitTls}
              onCheckedChange={setSmtpExplicitTls}
            />
            <Label htmlFor="smtpExplicitTls" className="cursor-pointer">
              Force SSL/TLS implicit (typically port 465). Off = auto from port.
            </Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtpUser">SMTP user</Label>
            <Input
              id="smtpUser"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtpPassword">SMTP password</Label>
            <Input
              id="smtpPassword"
              type="password"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              placeholder={smtpPasswordWasSet ? "•••••••• (leave blank to keep)" : ""}
              autoComplete="new-password"
            />
            {smtpPasswordWasSet && (
              <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => void clearSmtpPassword()}>
                Clear stored password
              </Button>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="fromName">From display name</Label>
            <Input
              id="fromName"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder='e.g. "StockFlow"'
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fromAddress">From email address</Label>
            <Input
              id="fromAddress"
              type="email"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="noreply@example.com"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="publicSiteUrl">Public site URL (for email links)</Label>
            <Input
              id="publicSiteUrl"
              value={publicSiteUrl}
              onChange={(e) => setPublicSiteUrl(e.target.value)}
              placeholder="https://app.example.com"
            />
            <p className="text-xs text-slate-500">
              If empty, uses <code className="text-[11px]">SITE_URL</code> or{" "}
              <code className="text-[11px]">NEXT_PUBLIC_SITE_URL</code>.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
        <Separator className="my-4" />
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3">
            <div>
              <p className="font-medium text-slate-900">Customer quotation email</p>
              <p className="text-sm text-slate-500">Sent after checkout when a quotation is created.</p>
            </div>
            <Switch
              checked={sendCustomerQuotationEmail}
              onCheckedChange={setSendCustomerQuotationEmail}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3">
            <div>
              <p className="font-medium text-slate-900">Admin: new quotation</p>
              <p className="text-sm text-slate-500">Notify your team when a customer requests a quotation.</p>
            </div>
            <Switch checked={notifyAdminsNewQuotation} onCheckedChange={setNotifyAdminsNewQuotation} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3">
            <div>
              <p className="font-medium text-slate-900">Customer invoice email</p>
              <p className="text-sm text-slate-500">Sent when an invoice is issued from admin.</p>
            </div>
            <Switch checked={sendCustomerInvoiceEmail} onCheckedChange={setSendCustomerInvoiceEmail} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3">
            <div>
              <p className="font-medium text-slate-900">Admin: invoice sent</p>
              <p className="text-sm text-slate-500">Notify your team when an invoice goes to a customer.</p>
            </div>
            <Switch checked={notifyAdminsInvoiceSent} onCheckedChange={setNotifyAdminsInvoiceSent} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Recipient lists</h2>
        <p className="mt-1 text-sm text-slate-500">One email per line, or comma-separated.</p>
        <Separator className="my-4" />
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qRecips">Admin emails — new quotations</Label>
            <textarea
              id="qRecips"
              className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[120px] w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-50"
              value={quotationRecipients}
              onChange={(e) => setQuotationRecipients(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="iRecips">Admin emails — invoice sent</Label>
            <textarea
              id="iRecips"
              className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[120px] w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-50"
              value={invoiceRecipients}
              onChange={(e) => setInvoiceRecipients(e.target.value)}
            />
          </div>
        </div>
      </section>

      <div className="flex gap-3">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
