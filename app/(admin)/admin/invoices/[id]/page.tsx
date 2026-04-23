"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  getZimraQrEmbedString,
  isInvoiceZimraVerifiedForDisplay,
} from "@/lib/utils/zimraInvoiceDisplay";

type InvLine = {
  lineNo: number;
  lineType: string;
  hsCode?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxCode: string;
  taxPercent: number;
  vatAmount: number;
  lineTotalExcl: number;
  lineTotalIncl: number;
};

type FiscalData = {
  verificationCode: string;
  verificationLink: string;
  qrCodeUrl: string;
  receiptHash?: string;
  fiscalDayNo: number | null;
  fdmsInvoiceNo: string;
  receiptGlobalNo: string;
  receiptCounter: string;
  receiptId: string;
  deviceId: string;
};

type BuyerSnapshot = {
  registerName: string;
  tradeName: string;
  tin: string;
  vatNumber: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
};

type Seller = {
  legalName: string;
  tradeName: string;
  tin: string;
  vatNumber: string;
  address: string;
  phone: string;
  email: string;
  region: string;
  city: string;
};

type InvoiceDetail = {
  _id: string;
  invoiceNumber: string;
  status: string;
  fiscalStatus: string;
  isFiscalized: boolean;
  fiscalSubmittedAt?: string;
  createdAt: string;
  receiptType: string;
  receiptCurrency: string;
  receiptDate?: string;
  receiptPrintForm: string;
  paymentMethod: string;
  taxInclusive: boolean;
  subtotalExclTax: number;
  totalVat: number;
  totalAmount: number;
  receiptNotes?: string;
  fiscalData?: FiscalData;
  lines: InvLine[];
  buyerSnapshot?: BuyerSnapshot;
};

function fmt(n: number, currency = "USD") {
  return `${currency} ${n.toFixed(2)}`;
}

function StatusBadge({ zimraVerified }: { zimraVerified: boolean }) {
  if (zimraVerified) {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
        ZIMRA verified
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
      Not fiscalized
    </span>
  );
}

export default function AdminInvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fiscalizing, setFiscalizing] = useState(false);
  const [fiscalError, setFiscalError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [fiscalDayOpen, setFiscalDayOpen] = useState<boolean | null>(null);
  const [fiscalDayStatus, setFiscalDayStatus] = useState<string>("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/invoices/${id}`);
    if (res.status === 401) {
      router.replace("/sign-in");
      return;
    }
    if (res.status === 403) {
      setError("Admin access required.");
      setLoading(false);
      return;
    }
    if (!res.ok) {
      setError("Invoice not found.");
      setLoading(false);
      return;
    }

    const json = await res.json() as { success: boolean; data: { invoice: InvoiceDetail; seller: Seller } };
    if (json.success && json.data?.invoice) {
      setInvoice(json.data.invoice);
      setSeller(json.data.seller ?? null);
    }
    setLoading(false);
  }, [id, router]);

  const loadFiscalDayStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/fiscal-day/status");
      if (res.ok) {
        const json = await res.json() as { isOpen: boolean; status: string };
        setFiscalDayOpen(json.isOpen);
        setFiscalDayStatus(json.status);
      }
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    void load();
    void loadFiscalDayStatus();
  }, [load, loadFiscalDayStatus]);

  useEffect(() => {
    if (!invoice) {
      setQrDataUrl("");
      return;
    }
    if (!isInvoiceZimraVerifiedForDisplay(invoice)) {
      setQrDataUrl("");
      return;
    }
    const s = getZimraQrEmbedString(invoice.fiscalData);
    if (!s) {
      setQrDataUrl("");
      return;
    }
    void QRCode.toDataURL(s, { errorCorrectionLevel: "M", width: 160, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [invoice]);

  async function fiscalize() {
    setFiscalizing(true);
    setFiscalError(null);
    try {
      const res = await fetch(`/api/admin/invoices/${id}/fiscalize`, { method: "POST" });
      const json = await res.json() as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setFiscalError(json.message ?? "Fiscalization failed");
        return;
      }
      await load();
    } catch {
      setFiscalError("Network error during fiscalization");
    } finally {
      setFiscalizing(false);
    }
  }

  async function markSent() {
    setMarking(true);
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "sent" }),
      });
      if (res.ok) await load();
    } finally {
      setMarking(false);
    }
  }

  if (loading) {
    return <div className="flex flex-1 flex-col px-4 py-8 text-muted-foreground lg:px-6">Loading…</div>;
  }

  if (error && !invoice) {
    return <div className="flex flex-1 flex-col px-4 py-8 text-red-600 lg:px-6">{error}</div>;
  }

  if (!invoice) return null;

  const isZimraVerified = isInvoiceZimraVerifiedForDisplay(invoice);
  const currency = invoice.receiptCurrency || "USD";
  const verifyUrl = isZimraVerified ? getZimraQrEmbedString(invoice.fiscalData) : "";

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-white px-4 py-3 shadow-sm lg:mx-6">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-700">Fiscal Day:</span>
          {fiscalDayOpen === null ? (
            <span className="text-sm text-slate-500">Checking…</span>
          ) : fiscalDayOpen ? (
            <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              Open
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
              Closed
            </span>
          )}
          {fiscalDayStatus && <span className="text-xs text-slate-400">({fiscalDayStatus})</span>}
        </div>
        {!fiscalDayOpen && fiscalDayOpen !== null && (
          <p className="text-xs text-amber-700">
            You must open the fiscal day before fiscalizing invoices.
          </p>
        )}
      </div>

      <div className="mt-2 flex w-full flex-wrap items-center gap-2 px-4 no-print lg:px-6">
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/admin/invoices" className="hover:text-foreground">
            Invoices
          </Link>
          <span aria-hidden>/</span>
          <span className="font-mono text-xs text-slate-900">{invoice.invoiceNumber}</span>
        </nav>
      </div>

      <div className="flex flex-col gap-4 px-4 py-6 lg:px-6">
        {/* Single invoice document */}
        <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice</p>
              <p className="font-mono text-2xl font-bold tracking-tight text-slate-900">{invoice.invoiceNumber}</p>
              <p className="mt-1 text-sm text-slate-600">
                {invoice.receiptType} · {invoice.receiptCurrency} · {invoice.paymentMethod}
              </p>
              <p className="text-sm text-slate-600">
                {new Date(invoice.receiptDate ?? invoice.createdAt).toLocaleString()}
              </p>
            </div>
            <StatusBadge zimraVerified={isZimraVerified} />
          </div>

          {!isZimraVerified && (
            <div className="mt-4 rounded-md border border-blue-200 bg-blue-50/80 p-4">
              <h2 className="text-sm font-semibold text-blue-900">Fiscalize this invoice</h2>
              <p className="mt-1 text-xs text-blue-800">
                Submit to ZIMRA FDMS. Permanent once submitted. Open the fiscal day first.
              </p>
              {fiscalError && (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
                  <strong>ZIMRA:</strong> {fiscalError}
                </div>
              )}
              <div className="mt-3">
                <Button
                  type="button"
                  size="sm"
                  className="bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                  disabled={fiscalizing || fiscalDayOpen === false}
                  onClick={() => void fiscalize()}
                >
                  {fiscalizing ? "Submitting…" : "Fiscalize invoice"}
                </Button>
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seller</h2>
              {seller && (
                <dl className="mt-2 space-y-1 text-sm text-slate-800">
                  {seller.legalName && <div className="font-medium">{seller.legalName}</div>}
                  {seller.tradeName && <div className="text-slate-800">{seller.tradeName}</div>}
                  {seller.tin && (
                    <div>
                      <span className="text-slate-500">TIN: </span>
                      <span className="font-mono">{seller.tin}</span>
                    </div>
                  )}
                  {seller.vatNumber && (
                    <div>
                      <span className="text-slate-500">VAT: </span>
                      <span className="font-mono">{seller.vatNumber}</span>
                    </div>
                  )}
                  {seller.email && <div>{seller.email}</div>}
                  {seller.phone && <div>Tel: {seller.phone}</div>}
                  {seller.address && <div>{seller.address}</div>}
                  {(seller.city || seller.region) && (
                    <div>
                      {seller.city}
                      {seller.region ? `, ${seller.region}` : ""}
                    </div>
                  )}
                </dl>
              )}
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to</h2>
              {invoice.buyerSnapshot ? (
                <dl className="mt-2 space-y-1 text-sm text-slate-800">
                  {invoice.buyerSnapshot.registerName && (
                    <div className="font-medium">{invoice.buyerSnapshot.registerName}</div>
                  )}
                  {invoice.buyerSnapshot.tradeName && <div>{invoice.buyerSnapshot.tradeName}</div>}
                  {invoice.buyerSnapshot.tin && (
                    <div>
                      <span className="text-slate-500">TIN: </span>
                      <span className="font-mono">{invoice.buyerSnapshot.tin}</span>
                    </div>
                  )}
                  {invoice.buyerSnapshot.vatNumber && (
                    <div>
                      <span className="text-slate-500">VAT: </span>
                      <span className="font-mono">{invoice.buyerSnapshot.vatNumber}</span>
                    </div>
                  )}
                  {invoice.buyerSnapshot.email && <div>{invoice.buyerSnapshot.email}</div>}
                  {invoice.buyerSnapshot.phone && <div>Tel: {invoice.buyerSnapshot.phone}</div>}
                  {invoice.buyerSnapshot.address && <div>{invoice.buyerSnapshot.address}</div>}
                  {(invoice.buyerSnapshot.city || invoice.buyerSnapshot.province) && (
                    <div>
                      {invoice.buyerSnapshot.city}
                      {invoice.buyerSnapshot.province ? `, ${invoice.buyerSnapshot.province}` : ""}
                    </div>
                  )}
                </dl>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No buyer data.</p>
              )}
            </div>
          </div>

          {invoice.lines && invoice.lines.length > 0 && (
            <div className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Line items</h2>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[880px] text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="py-2 pr-2">#</th>
                      <th className="py-2 pr-2">Type</th>
                      <th className="py-2 pr-2">Description</th>
                      <th className="py-2 pr-2">HS</th>
                      <th className="py-2 pr-2 text-right">Qty</th>
                      <th className="py-2 pr-2 text-right">Unit</th>
                      <th className="py-2 pr-2 text-center">Tax</th>
                      <th className="py-2 pr-2 text-right">Excl</th>
                      <th className="py-2 pr-2 text-right">VAT</th>
                      <th className="py-2 pr-2 text-right">Incl</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoice.lines.map((line) => (
                      <tr key={line.lineNo}>
                        <td className="py-2 pr-2 text-slate-500">{line.lineNo}</td>
                        <td className="py-2 pr-2 text-xs text-slate-600">{line.lineType || "—"}</td>
                        <td className="py-2 pr-2 font-medium text-slate-900">{line.description}</td>
                        <td className="py-2 pr-2 font-mono text-xs text-slate-500">{line.hsCode || "—"}</td>
                        <td className="py-2 pr-2 text-right">{line.quantity}</td>
                        <td className="py-2 pr-2 text-right">{fmt(line.unitPrice, currency)}</td>
                        <td className="py-2 pr-2 text-center">
                          {line.taxCode} ({line.taxPercent}%)
                        </td>
                        <td className="py-2 pr-2 text-right">{fmt(line.lineTotalExcl, currency)}</td>
                        <td className="py-2 pr-2 text-right">{fmt(line.vatAmount, currency)}</td>
                        <td className="py-2 pr-2 text-right font-semibold">{fmt(line.lineTotalIncl, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-col items-end gap-1 text-sm">
                <div className="flex w-52 justify-between">
                  <span className="text-slate-500">Subtotal (excl)</span>
                  <span>{fmt(invoice.subtotalExclTax, currency)}</span>
                </div>
                <div className="flex w-52 justify-between">
                  <span className="text-slate-500">VAT</span>
                  <span>{fmt(invoice.totalVat, currency)}</span>
                </div>
                <div className="flex w-52 justify-between border-t border-slate-200 pt-1 text-base font-bold">
                  <span>Total</span>
                  <span>{fmt(invoice.totalAmount, currency)}</span>
                </div>
              </div>
            </div>
          )}

          {isZimraVerified && invoice.fiscalData && (
            <div className="mt-8 border-t border-slate-200 pt-6">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                ZIMRA verification
              </p>
              <div className="flex flex-row flex-wrap items-start gap-4">
                <div className="flex shrink-0 flex-col gap-1">
                  {qrDataUrl && (
                    <Image
                      src={qrDataUrl}
                      alt="ZIMRA verification QR"
                      width={112}
                      height={112}
                      className="border border-slate-200"
                    />
                  )}
                  <p className="max-w-[140px] text-[10px] leading-snug text-slate-500">
                    Scan to open verification.
                  </p>
                  {verifyUrl && /^https?:\/\//i.test(verifyUrl) && (
                    <a
                      href={verifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="max-w-[220px] break-all text-[10px] text-blue-600 hover:underline"
                    >
                      {verifyUrl}
                    </a>
                  )}
                </div>
                <dl className="min-w-0 space-y-1.5 text-[11px] leading-snug text-slate-700">
                  <div>
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Submitted
                    </dt>
                    <dd className="font-normal text-slate-700">
                      {invoice.fiscalSubmittedAt
                        ? new Date(invoice.fiscalSubmittedAt).toLocaleString()
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Verification code
                    </dt>
                    <dd className="font-mono text-[11px] text-slate-800">
                      {invoice.fiscalData.verificationCode || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      FDMS invoice no.
                    </dt>
                    <dd className="font-mono text-[11px] text-slate-800">
                      {invoice.fiscalData.fdmsInvoiceNo || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Fiscal day / receipt global
                    </dt>
                    <dd className="text-[11px]">
                      {invoice.fiscalData.fiscalDayNo ?? "—"} / {invoice.fiscalData.receiptGlobalNo || "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          {invoice.receiptNotes && (
            <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-600">
              Notes: {invoice.receiptNotes}
            </p>
          )}
        </div>

        <div className="no-print flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => window.open(`/admin/invoices/${id}/print`, "_blank")}>
            Print invoice
          </Button>
          {!isZimraVerified && invoice.status === "draft" && (
            <Button type="button" variant="outline" disabled={marking} onClick={() => void markSent()}>
              {marking ? "Updating…" : "Mark as sent"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
