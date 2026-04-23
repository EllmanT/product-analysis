"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

import {
  getZimraQrEmbedString,
  isInvoiceZimraVerifiedForDisplay,
} from "@/lib/utils/zimraInvoiceDisplay";

type InvoiceItem = {
  name: string;
  standardCode: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
};

type InvLine = {
  lineNo: number;
  lineType?: string;
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
  verificationCode?: string;
  verificationLink?: string;
  qrCodeUrl?: string;
  receiptHash?: string;
  fiscalDayNo?: number | null;
  fdmsInvoiceNo?: string;
  receiptGlobalNo?: string;
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
  lines?: InvLine[];
  buyerSnapshot?: BuyerSnapshot | null;
  seller?: Seller;
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
      if (res.status === 401) {
        router.replace(`/login?redirect=/account/invoices/${id}`);
        return;
      }
      if (res.status === 404) {
        router.replace("/account/invoices");
        return;
      }
      if (res.ok) {
        const json = await res.json() as { success: boolean; data: InvoiceData };
        if (json.success) {
          setInvoice(json.data);
        }
      }
      setLoading(false);
    })();
  }, [id, router]);

  useEffect(() => {
    if (!invoice) {
      setQrDataUrl("");
      return;
    }
    if (!isInvoiceZimraVerifiedForDisplay(invoice)) {
      setQrDataUrl("");
      return;
    }
    const s = getZimraQrEmbedString(invoice.fiscalData ?? undefined);
    if (!s) {
      setQrDataUrl("");
      return;
    }
    void QRCode.toDataURL(s, { errorCorrectionLevel: "M", width: 160, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [invoice]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-slate-500">Loading…</div>;
  }

  if (!invoice) return null;

  const currency = invoice.receiptCurrency || "USD";
  const isZimraVerified = isInvoiceZimraVerifiedForDisplay(invoice);
  const grandTotal = invoice.totalAmount ?? parseFloat(invoice.subtotal);
  const seller = invoice.seller;
  const useLines = invoice.lines && invoice.lines.length > 0;
  const verifyUrl = isZimraVerified ? getZimraQrEmbedString(invoice.fiscalData ?? undefined) : "";

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          @page { margin: 12mm; size: A4; }
        }
      `}</style>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <nav className="no-print mb-4 text-sm text-slate-500">
          <Link href="/account" className="hover:text-slate-900">
            Dashboard
          </Link>
          <span className="mx-2">/</span>
          <Link href="/account/invoices" className="hover:text-slate-900">
            Invoices
          </Link>
          <span className="mx-2">/</span>
          <span className="font-medium text-slate-900">{invoice.invoiceNumber}</span>
        </nav>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Invoice</p>
              <p className="font-mono text-xl font-bold text-slate-900">{invoice.invoiceNumber}</p>
              <p className="mt-1 text-sm text-slate-600">{fmtDate(invoice.createdAt)} · {currency}</p>
              {invoice.paymentMethod && (
                <p className="text-sm text-slate-600">Payment: {invoice.paymentMethod}</p>
              )}
            </div>
            <div>
              {isZimraVerified ? (
                <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  ZIMRA verified
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  Not fiscalized yet
                </span>
              )}
            </div>
          </div>

          {!isZimraVerified && (
            <div className="no-print mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Your invoice will show ZIMRA verification details here once the seller fiscalizes it.
            </div>
          )}

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <h2 className="text-xs font-semibold uppercase text-slate-500">Seller</h2>
              {seller && (
                <dl className="mt-2 space-y-1 text-sm text-slate-800">
                  {seller.legalName && <div className="font-medium">{seller.legalName}</div>}
                  {seller.tradeName && <div>{seller.tradeName}</div>}
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
              <h2 className="text-xs font-semibold uppercase text-slate-500">Bill to</h2>
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
                <p className="mt-2 text-sm text-slate-500">—</p>
              )}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            {useLines ? (
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs font-semibold text-slate-600">
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
                  {invoice.lines!.map((line) => (
                    <tr key={line.lineNo}>
                      <td className="py-2 pr-2 text-slate-500">{line.lineNo}</td>
                      <td className="py-2 pr-2 text-xs text-slate-600">{line.lineType || "—"}</td>
                      <td className="py-2 pr-2 font-medium text-slate-900">{line.description}</td>
                      <td className="py-2 pr-2 font-mono text-xs text-slate-500">{line.hsCode || "—"}</td>
                      <td className="py-2 pr-2 text-right">{line.quantity}</td>
                      <td className="py-2 pr-2 text-right">{fmtMoney(line.unitPrice, currency)}</td>
                      <td className="py-2 pr-2 text-center text-xs">
                        {line.taxCode} ({line.taxPercent}%)
                      </td>
                      <td className="py-2 pr-2 text-right">
                        {fmtMoney(line.lineTotalExcl ?? 0, currency)}
                      </td>
                      <td className="py-2 pr-2 text-right">{fmtMoney(line.vatAmount, currency)}</td>
                      <td className="py-2 pr-2 text-right font-semibold">
                        {fmtMoney(line.lineTotalIncl, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="py-2 pr-2">Product</th>
                    <th className="py-2 pr-2">SKU</th>
                    <th className="py-2 pr-2 text-center">Qty</th>
                    <th className="py-2 pr-2 text-right">Unit</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.items.map((item, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-2 font-medium text-slate-900">{item.name}</td>
                      <td className="py-2 pr-2 font-mono text-xs text-slate-500">{item.standardCode}</td>
                      <td className="py-2 pr-2 text-center">{item.quantity}</td>
                      <td className="py-2 pr-2 text-right">{fmtMoney(item.unitPrice, currency)}</td>
                      <td className="py-2 text-right font-semibold">{fmtMoney(item.lineTotal, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-4 flex flex-col items-end gap-1 border-t border-slate-100 pt-4 text-sm">
            {invoice.subtotalExclTax != null && (
              <div className="flex w-52 justify-between text-slate-600">
                <span>Subtotal (excl)</span>
                <span>{fmtMoney(invoice.subtotalExclTax, currency)}</span>
              </div>
            )}
            {invoice.totalVat != null && invoice.totalVat > 0 && (
              <div className="flex w-52 justify-between text-slate-600">
                <span>VAT</span>
                <span>{fmtMoney(invoice.totalVat, currency)}</span>
              </div>
            )}
            <div className="flex w-52 justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
              <span>Total</span>
              <span>{fmtMoney(grandTotal, currency)}</span>
            </div>
          </div>

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
                  <p className="max-w-[140px] text-[10px] leading-snug text-slate-500">Scan to verify.</p>
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
                  {invoice.fiscalSubmittedAt && (
                    <div>
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Submitted</dt>
                      <dd>{new Date(invoice.fiscalSubmittedAt).toLocaleString()}</dd>
                    </div>
                  )}
                  {invoice.fiscalData.verificationCode && (
                    <div>
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Verification code
                      </dt>
                      <dd className="font-mono text-[11px]">{invoice.fiscalData.verificationCode}</dd>
                    </div>
                  )}
                  {invoice.fiscalData.fdmsInvoiceNo && (
                    <div>
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        FDMS invoice no.
                      </dt>
                      <dd className="font-mono text-[11px]">{invoice.fiscalData.fdmsInvoiceNo}</dd>
                    </div>
                  )}
                  {invoice.fiscalData.fiscalDayNo != null && (
                    <div>
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Fiscal day</dt>
                      <dd>{invoice.fiscalData.fiscalDayNo}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          )}

          {invoice.receiptNotes && (
            <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-600">Notes: {invoice.receiptNotes}</p>
          )}
        </div>

        <div className="no-print mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 rounded-lg border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Print
          </button>
          <a
            href={`/api/shop/dashboard/invoices/${invoice._id}/pdf`}
            className="flex flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Download PDF
          </a>
          <Link
            href="/account/invoices"
            className="flex flex-1 items-center justify-center rounded-lg bg-slate-100 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
          >
            Back
          </Link>
        </div>
      </div>
    </div>
  );
}
