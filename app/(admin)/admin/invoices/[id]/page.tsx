"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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

function StatusBadge({ isFiscalized, fiscalStatus }: { isFiscalized: boolean; fiscalStatus: string }) {
  if (isFiscalized || fiscalStatus === "SUBMITTED") {
    return <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">SUBMITTED</span>;
  }
  return <span className="inline-flex rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">DRAFT</span>;
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
  const qrRef = useRef(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/invoices/${id}`);
    if (res.status === 401) { router.replace("/sign-in"); return; }
    if (res.status === 403) { setError("Admin access required."); setLoading(false); return; }
    if (!res.ok) { setError("Invoice not found."); setLoading(false); return; }

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

  // Generate QR code when fiscal data is available
  useEffect(() => {
    if (qrRef.current) return;
    const qrSource = invoice?.fiscalData?.verificationLink || invoice?.fiscalData?.qrCodeUrl;
    if (!qrSource) return;
    qrRef.current = true;
    QRCode.toDataURL(qrSource, { errorCorrectionLevel: "M", width: 180, margin: 1 })
      .then((url) => setQrDataUrl(url))
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
      qrRef.current = false;
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

  const isFiscalized = invoice.isFiscalized || invoice.fiscalStatus === "SUBMITTED";
  const currency = invoice.receiptCurrency || "USD";

  return (
    <div className="flex flex-1 flex-col">
      {/* Fiscal Day Status Bar */}
      <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-white px-4 py-3 shadow-sm lg:mx-6">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-700">Fiscal Day:</span>
          {fiscalDayOpen === null ? (
            <span className="text-sm text-slate-500">Checking…</span>
          ) : fiscalDayOpen ? (
            <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">Open</span>
          ) : (
            <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">Closed</span>
          )}
          {fiscalDayStatus && <span className="text-xs text-slate-400">({fiscalDayStatus})</span>}
        </div>
        {!fiscalDayOpen && fiscalDayOpen !== null && (
          <p className="text-xs text-amber-700">⚠ You must open the fiscal day before fiscalizing invoices.</p>
        )}
      </div>

      {/* Breadcrumb */}
      <div className="mt-2 flex w-full flex-wrap items-center gap-2 px-4 no-print lg:px-6">
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/admin/invoices" className="hover:text-foreground">Invoices</Link>
          <span aria-hidden>/</span>
          <span className="font-mono text-xs text-slate-900">{invoice.invoiceNumber}</span>
        </nav>
      </div>

      <div className="flex flex-col gap-4 px-4 py-6 lg:px-6">

        {/* Header card */}
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">Invoice Number</p>
              <p className="font-mono text-2xl font-bold tracking-tight text-slate-900">{invoice.invoiceNumber}</p>
              <p className="mt-1 text-sm text-slate-600">
                {invoice.receiptType} · {invoice.receiptCurrency} · {invoice.paymentMethod}
              </p>
              <p className="text-sm text-slate-600">
                Date: {new Date(invoice.receiptDate ?? invoice.createdAt).toLocaleString()}
              </p>
            </div>
            <StatusBadge isFiscalized={isFiscalized} fiscalStatus={invoice.fiscalStatus} />
          </div>
        </div>

        {/* Fiscalize button or fiscal data */}
        {!isFiscalized ? (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-5">
            <h2 className="text-base font-semibold text-blue-900">Fiscalize this Invoice</h2>
            <p className="mt-1 text-sm text-blue-800">
              Submit this invoice to ZIMRA FDMS. This action is permanent and cannot be undone.
              Ensure the fiscal day is open before proceeding.
            </p>
            {fiscalError && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                <strong>ZIMRA Error:</strong> {fiscalError}
              </div>
            )}
            <div className="mt-4">
              <Button
                type="button"
                className="bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                disabled={fiscalizing || fiscalDayOpen === false}
                onClick={() => void fiscalize()}
              >
                {fiscalizing ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Submitting to ZIMRA…
                  </span>
                ) : "Fiscalize Invoice"}
              </Button>
            </div>
          </div>
        ) : (
          /* Fiscal Data Card */
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <h2 className="text-base font-semibold text-emerald-900">✓ Fiscally Verified</h2>
            <p className="mt-0.5 text-xs text-emerald-700">
              Submitted {invoice.fiscalSubmittedAt ? new Date(invoice.fiscalSubmittedAt).toLocaleString() : ""}
            </p>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-emerald-700">Verification Code</dt>
                <dd className="font-mono font-semibold text-slate-900">{invoice.fiscalData?.verificationCode || "—"}</dd>
              </div>
              <div>
                <dt className="text-emerald-700">FDMS Invoice No</dt>
                <dd className="font-mono font-semibold text-slate-900">{invoice.fiscalData?.fdmsInvoiceNo || "—"}</dd>
              </div>
              <div>
                <dt className="text-emerald-700">Fiscal Day No</dt>
                <dd className="font-semibold text-slate-900">{invoice.fiscalData?.fiscalDayNo ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-emerald-700">Receipt Global No</dt>
                <dd className="font-semibold text-slate-900">{invoice.fiscalData?.receiptGlobalNo || "—"}</dd>
              </div>
              {invoice.fiscalData?.verificationLink && (
                <div className="sm:col-span-2">
                  <dt className="text-emerald-700">Verification Link</dt>
                  <dd>
                    <a
                      href={invoice.fiscalData.verificationLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-blue-600 hover:underline"
                    >
                      {invoice.fiscalData.verificationLink}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
            {qrDataUrl && (
              <div className="mt-4 flex flex-col items-start gap-1">
                <Image src={qrDataUrl} alt="ZIMRA verification QR code" width={130} height={130} className="rounded border border-emerald-200" />
                <p className="text-xs text-emerald-700">Scan to verify on ZIMRA</p>
              </div>
            )}
          </div>
        )}

        {/* Seller + Buyer */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Seller</h2>
            <dl className="mt-3 space-y-1 text-sm">
              {seller?.legalName && <div><dt className="inline text-slate-500">Legal Name: </dt><dd className="inline font-medium">{seller.legalName}</dd></div>}
              {seller?.tradeName && <div><dt className="inline text-slate-500">Trade Name: </dt><dd className="inline">{seller.tradeName}</dd></div>}
              {seller?.tin && <div><dt className="inline text-slate-500">TIN: </dt><dd className="inline font-mono">{seller.tin}</dd></div>}
              {seller?.vatNumber && <div><dt className="inline text-slate-500">VAT: </dt><dd className="inline font-mono">{seller.vatNumber}</dd></div>}
              {seller?.address && <div><dt className="inline text-slate-500">Address: </dt><dd className="inline">{seller.address}</dd></div>}
              {seller?.phone && <div><dt className="inline text-slate-500">Phone: </dt><dd className="inline">{seller.phone}</dd></div>}
              {seller?.email && <div><dt className="inline text-slate-500">Email: </dt><dd className="inline">{seller.email}</dd></div>}
            </dl>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Customer / Buyer</h2>
            {invoice.buyerSnapshot ? (
              <dl className="mt-3 space-y-1 text-sm">
                {invoice.buyerSnapshot.registerName && <div><dt className="inline text-slate-500">Name: </dt><dd className="inline font-medium">{invoice.buyerSnapshot.registerName}</dd></div>}
                {invoice.buyerSnapshot.tradeName && <div><dt className="inline text-slate-500">Trade Name: </dt><dd className="inline">{invoice.buyerSnapshot.tradeName}</dd></div>}
                {invoice.buyerSnapshot.tin && <div><dt className="inline text-slate-500">TIN: </dt><dd className="inline font-mono">{invoice.buyerSnapshot.tin}</dd></div>}
                {invoice.buyerSnapshot.vatNumber && <div><dt className="inline text-slate-500">VAT: </dt><dd className="inline font-mono">{invoice.buyerSnapshot.vatNumber}</dd></div>}
                {invoice.buyerSnapshot.email && <div><dt className="inline text-slate-500">Email: </dt><dd className="inline">{invoice.buyerSnapshot.email}</dd></div>}
                {invoice.buyerSnapshot.phone && <div><dt className="inline text-slate-500">Phone: </dt><dd className="inline">{invoice.buyerSnapshot.phone}</dd></div>}
                {invoice.buyerSnapshot.address && <div><dt className="inline text-slate-500">Address: </dt><dd className="inline">{invoice.buyerSnapshot.address}</dd></div>}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No buyer data.</p>
            )}
          </div>
        </div>

        {/* Line Items */}
        {invoice.lines && invoice.lines.length > 0 && (
          <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Line Items</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-600">
                  <tr>
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3">HS Code</th>
                    <th className="py-2 pr-3 text-right">Qty</th>
                    <th className="py-2 pr-3 text-right">Unit Price</th>
                    <th className="py-2 pr-3 text-center">Tax</th>
                    <th className="py-2 pr-3 text-right">VAT</th>
                    <th className="py-2 text-right">Total (Incl)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.lines.map((line) => (
                    <tr key={line.lineNo}>
                      <td className="py-2.5 pr-3 text-slate-500">{line.lineNo}</td>
                      <td className="py-2.5 pr-3 font-medium text-slate-900">{line.description}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-slate-500">{line.hsCode || "—"}</td>
                      <td className="py-2.5 pr-3 text-right text-slate-700">{line.quantity}</td>
                      <td className="py-2.5 pr-3 text-right text-slate-700">{fmt(line.unitPrice, currency)}</td>
                      <td className="py-2.5 pr-3 text-center text-slate-700">{line.taxCode} ({line.taxPercent}%)</td>
                      <td className="py-2.5 pr-3 text-right text-slate-700">{fmt(line.vatAmount, currency)}</td>
                      <td className="py-2.5 text-right font-semibold text-slate-900">{fmt(line.lineTotalIncl, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col items-end gap-1 text-sm">
              <div className="flex w-48 justify-between">
                <span className="text-slate-500">Subtotal (excl tax)</span>
                <span>{fmt(invoice.subtotalExclTax, currency)}</span>
              </div>
              <div className="flex w-48 justify-between">
                <span className="text-slate-500">VAT</span>
                <span>{fmt(invoice.totalVat, currency)}</span>
              </div>
              <div className="flex w-48 justify-between border-t border-slate-200 pt-1 text-base font-bold">
                <span>Grand Total</span>
                <span>{fmt(invoice.totalAmount, currency)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="no-print flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => window.open(`/admin/invoices/${id}/print`, "_blank")}>
            Print Invoice
          </Button>
          {!isFiscalized && invoice.status === "draft" && (
            <Button
              type="button"
              variant="outline"
              disabled={marking}
              onClick={() => void markSent()}
            >
              {marking ? "Updating…" : "Mark as Sent"}
            </Button>
          )}
        </div>

      </div>
    </div>
  );
}
