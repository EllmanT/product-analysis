"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

type InvoiceItem = {
  name: string;
  standardCode: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
};

type FiscalData = {
  verificationCode?: string;
  verificationLink?: string;
  qrCodeUrl?: string;
  fiscalDayNo?: number | null;
  fdmsInvoiceNo?: string;
  receiptGlobalNo?: string;
};

type InvoiceData = {
  _id: string;
  invoiceNumber: string;
  quotationId: string;
  items: InvoiceItem[];
  subtotal: string;
  totalAmount?: number;
  totalVat?: number;
  subtotalExclTax?: number;
  status: string;
  createdAt: string;
  receiptCurrency?: string;
  paymentMethod?: string;
  isFiscalized?: boolean;
  fiscalStatus?: string;
  fiscalSubmittedAt?: string;
  receiptNotes?: string;
  fiscalData?: FiscalData | null;
};

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(n: number | string, currency = "USD"): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return `${currency} ${isNaN(num) ? "0.00" : num.toFixed(2)}`;
}

export default function InvoiceDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/shop/dashboard/invoices/${id}`, { credentials: "include" });
      if (res.status === 401) { router.replace(`/login?redirect=/account/invoices/${id}`); return; }
      if (res.status === 404) { router.replace("/account/invoices"); return; }
      if (res.ok) {
        const json = await res.json() as { success: boolean; data: InvoiceData };
        if (json.success) {
          setInvoice(json.data);
          const qrSource = json.data.fiscalData?.verificationLink || json.data.fiscalData?.qrCodeUrl;
          if (qrSource) {
            QRCode.toDataURL(qrSource, { errorCorrectionLevel: "M", width: 180, margin: 1 })
              .then((url) => setQrDataUrl(url))
              .catch(() => {});
          }
        }
      }
      setLoading(false);
    })();
  }, [id, router]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-slate-500">Loading…</div>;
  }

  if (!invoice) return null;

  const currency = invoice.receiptCurrency || "USD";
  const isFiscalized = invoice.isFiscalized || invoice.fiscalStatus === "SUBMITTED";
  const grandTotal = invoice.totalAmount ?? parseFloat(invoice.subtotal);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">

        {/* Breadcrumb */}
        <nav className="mb-4 text-sm text-[#6B7280]">
          <Link href="/account" className="hover:text-[#1E40AF]">Dashboard</Link>
          <span className="mx-2">/</span>
          <Link href="/account/invoices" className="hover:text-[#1E40AF]">Invoices</Link>
          <span className="mx-2">/</span>
          <span className="font-medium text-slate-900">{invoice.invoiceNumber}</span>
        </nav>

        <div className="relative overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.06)]">
          {/* Header band */}
          <div className="bg-[#064E3B] px-6 py-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xl font-bold tracking-wider text-white">STOCKFLOW</p>
                <p className="mt-0.5 text-xs text-[#6EE7B7]">FISCAL INVOICE</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-white">{invoice.invoiceNumber}</p>
                <p className="text-xs text-[#6EE7B7]">{fmtDate(invoice.createdAt)}</p>
              </div>
            </div>
          </div>

          {/* Status + details */}
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invoice Date</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{fmtDate(invoice.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</p>
                {isFiscalized ? (
                  <span className="mt-1 inline-flex items-center rounded-[6px] bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">Fiscalized</span>
                ) : (
                  <span className="mt-1 inline-flex items-center rounded-[6px] bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Processing</span>
                )}
              </div>
              {invoice.paymentMethod && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payment</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{invoice.paymentMethod}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Currency</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{currency}</p>
              </div>
            </div>
          </div>

          {/* Processing notice if not fiscalized */}
          {!isFiscalized && (
            <div className="border-b border-amber-100 bg-amber-50 px-6 py-4">
              <p className="text-sm text-amber-800">
                Your invoice is being processed. Once fiscalized by ZIMRA, your verification details will appear here.
              </p>
            </div>
          )}

          {/* Items table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">Product</th>
                  <th className="px-6 py-3">SKU</th>
                  <th className="px-6 py-3 text-center">Qty</th>
                  <th className="px-6 py-3 text-right">Unit Price</th>
                  <th className="px-6 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, i) => (
                  <tr key={i} className={`border-b border-slate-100 last:border-0 ${i % 2 === 1 ? "bg-slate-50/60" : ""}`}>
                    <td className="px-6 py-3 font-medium text-slate-900">{item.name}</td>
                    <td className="px-6 py-3 font-mono text-xs text-slate-500">{item.standardCode}</td>
                    <td className="px-6 py-3 text-center text-slate-700">{item.quantity}</td>
                    <td className="px-6 py-3 text-right text-slate-700">{fmtMoney(item.unitPrice, currency)}</td>
                    <td className="px-6 py-3 text-right font-semibold text-slate-900">{fmtMoney(item.lineTotal, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-6 py-5">
            <div className="ml-auto w-fit space-y-1">
              {invoice.subtotalExclTax != null && (
                <div className="flex justify-between gap-16 text-sm text-slate-600">
                  <span>Subtotal (excl tax)</span>
                  <span className="font-medium">{fmtMoney(invoice.subtotalExclTax, currency)}</span>
                </div>
              )}
              {invoice.totalVat != null && invoice.totalVat > 0 && (
                <div className="flex justify-between gap-16 text-sm text-slate-600">
                  <span>VAT</span>
                  <span className="font-medium">{fmtMoney(invoice.totalVat, currency)}</span>
                </div>
              )}
              <div className="flex justify-between gap-16 border-t border-slate-200 pt-2 text-base font-bold">
                <span className="text-slate-900">Total</span>
                <span style={{ color: "#059669" }}>{fmtMoney(grandTotal, currency)}</span>
              </div>
            </div>
          </div>

          {/* Fiscal verification block */}
          {isFiscalized && invoice.fiscalData && (
            <div className="border-t border-emerald-200 bg-emerald-50 px-6 py-5">
              <p className="text-sm font-semibold text-emerald-900">✓ Fiscally Verified by ZIMRA</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {invoice.fiscalData.verificationCode && (
                  <div>
                    <dt className="text-xs text-emerald-700">Verification Code</dt>
                    <dd className="font-mono font-semibold text-slate-900">{invoice.fiscalData.verificationCode}</dd>
                  </div>
                )}
                {invoice.fiscalData.fdmsInvoiceNo && (
                  <div>
                    <dt className="text-xs text-emerald-700">FDMS Invoice No</dt>
                    <dd className="font-mono font-semibold text-slate-900">{invoice.fiscalData.fdmsInvoiceNo}</dd>
                  </div>
                )}
                {invoice.fiscalData.fiscalDayNo != null && (
                  <div>
                    <dt className="text-xs text-emerald-700">Fiscal Day No</dt>
                    <dd className="font-semibold text-slate-900">{invoice.fiscalData.fiscalDayNo}</dd>
                  </div>
                )}
              </dl>
              {qrDataUrl && (
                <div className="mt-4 flex flex-col items-start gap-1">
                  <Image src={qrDataUrl} alt="ZIMRA verification QR code" width={130} height={130} className="rounded border border-emerald-200" />
                  <p className="text-xs text-emerald-700">Scan to verify this invoice on ZIMRA</p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-slate-100 px-6 py-5 flex gap-3">
            <button
              onClick={() => window.open(`/admin/invoices/${invoice._id}/print`, "_blank")}
              className="flex-1 rounded-[8px] border border-[#064E3B] py-3 text-sm font-semibold text-[#064E3B] transition hover:bg-[#064E3B] hover:text-white"
            >
              Print / Download
            </button>
            <Link
              href="/account/invoices"
              className="flex items-center justify-center rounded-[8px] bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              Back
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
