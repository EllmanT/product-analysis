"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";

import {
  getZimraQrEmbedString,
  isInvoiceZimraVerifiedForDisplay,
} from "@/lib/utils/zimraInvoiceDisplay";

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
  verificationCode: string;
  verificationLink: string;
  qrCodeUrl: string;
  receiptHash?: string;
  fiscalDayNo: number | null;
  fdmsInvoiceNo: string;
  receiptGlobalNo: string;
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
  return `${currency} ${Number(n).toFixed(2)}`;
}

function receiptTypeLabel(t: string) {
  if (t === "CreditNote") return "CREDIT NOTE";
  if (t === "DebitNote") return "DEBIT NOTE";
  return "FISCAL INVOICE";
}

export default function PrintInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/invoices/${id}`)
      .then((r) => {
        if (r.status === 401) {
          router.replace("/sign-in");
          return null;
        }
        return r.json() as Promise<{ success: boolean; data: { invoice: InvoiceDetail; seller: Seller } }>;
      })
      .then((json) => {
        if (json?.success && json.data?.invoice) {
          const inv = json.data.invoice;
          setInvoice(inv);
          setSeller(json.data.seller ?? null);
          if (isInvoiceZimraVerifiedForDisplay(inv)) {
            const s = getZimraQrEmbedString(inv.fiscalData);
            if (s) {
              void QRCode.toDataURL(s, { errorCorrectionLevel: "M", width: 140, margin: 1 })
                .then(setQrDataUrl)
                .catch(() => setQrDataUrl(""));
            }
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, router]);

  useEffect(() => {
    if (!loading && invoice) {
      const timer = setTimeout(() => window.print(), 600);
      return () => clearTimeout(timer);
    }
  }, [loading, invoice]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Preparing invoice…</div>;
  }

  if (!invoice) {
    return <div className="flex min-h-screen items-center justify-center text-red-600">Invoice not found.</div>;
  }

  const currency = invoice.receiptCurrency || "USD";
  const isZimraVerified = isInvoiceZimraVerifiedForDisplay(invoice);
  const verifyUrl = isZimraVerified ? getZimraQrEmbedString(invoice.fiscalData) : "";

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { margin: 15mm; size: A4; }
        }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #111; background: white; }
        .page { max-width: 800px; margin: 0 auto; padding: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #e5e7eb; padding: 6px 8px; vertical-align: top; }
        th { background: #f8fafc; text-align: left; font-size: 11px; }
        .right { text-align: right; }
        .center { text-align: center; }
        .mono { font-family: monospace; }
      `}</style>

      <div className="no-print fixed right-4 top-4 flex gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Print
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
      </div>

      <div className="page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>STOCKFLOW</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {seller?.tradeName || seller?.legalName || ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{receiptTypeLabel(invoice.receiptType)}</div>
            <div className="mono" style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
              {invoice.invoiceNumber}
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {new Date(invoice.receiptDate ?? invoice.createdAt).toLocaleDateString()}
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {currency} · {invoice.paymentMethod}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 12px" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                marginBottom: 4,
                textTransform: "uppercase",
              }}
            >
              Seller
            </div>
            {seller?.legalName && (
              <div style={{ fontWeight: 600 }}>{seller.legalName}</div>
            )}
            {seller?.tradeName && (
              <div style={seller.tradeName !== seller.legalName ? { color: "#64748b" } : undefined}>
                {seller.tradeName}
              </div>
            )}
            {seller?.tin && (
              <div>
                TIN: <span className="mono">{seller.tin}</span>
              </div>
            )}
            {seller?.vatNumber && (
              <div>
                VAT: <span className="mono">{seller.vatNumber}</span>
              </div>
            )}
            {seller?.email && <div>{seller.email}</div>}
            {seller?.phone && <div>Tel: {seller.phone}</div>}
            {seller?.address && <div>{seller.address}</div>}
            {(seller?.city || seller?.region) && (
              <div>
                {seller?.city}
                {seller?.region ? `, ${seller.region}` : ""}
              </div>
            )}
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 12px" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                marginBottom: 4,
                textTransform: "uppercase",
              }}
            >
              Bill To
            </div>
            {invoice.buyerSnapshot?.registerName && (
              <div><strong>{invoice.buyerSnapshot.registerName}</strong></div>
            )}
            {invoice.buyerSnapshot?.tradeName &&
              invoice.buyerSnapshot.tradeName !== invoice.buyerSnapshot.registerName && (
                <div style={{ color: "#64748b" }}>{invoice.buyerSnapshot.tradeName}</div>
              )}
            {invoice.buyerSnapshot?.tin && (
              <div>
                TIN: <span className="mono">{invoice.buyerSnapshot.tin}</span>
              </div>
            )}
            {invoice.buyerSnapshot?.vatNumber && (
              <div>
                VAT: <span className="mono">{invoice.buyerSnapshot.vatNumber}</span>
              </div>
            )}
            {invoice.buyerSnapshot?.email && <div>{invoice.buyerSnapshot.email}</div>}
            {invoice.buyerSnapshot?.phone && <div>Tel: {invoice.buyerSnapshot.phone}</div>}
            {invoice.buyerSnapshot?.address && <div>{invoice.buyerSnapshot.address}</div>}
            {invoice.buyerSnapshot?.city && (
              <div>
                {invoice.buyerSnapshot.city}
                {invoice.buyerSnapshot.province ? `, ${invoice.buyerSnapshot.province}` : ""}
              </div>
            )}
          </div>
        </div>

        <table style={{ marginBottom: 16, fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              <th style={{ width: 56 }}>Type</th>
              <th>Description</th>
              <th style={{ width: 64 }}>HS</th>
              <th style={{ width: 44 }} className="right">
                Qty
              </th>
              <th style={{ width: 78 }} className="right">
                Unit
              </th>
              <th style={{ width: 48 }} className="center">
                Tax
              </th>
              <th style={{ width: 44 }} className="right">
                Tax%
              </th>
              <th style={{ width: 78 }} className="right">
                Excl
              </th>
              <th style={{ width: 72 }} className="right">
                VAT
              </th>
              <th style={{ width: 86 }} className="right">
                Incl
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.lineNo}>
                <td>{line.lineNo}</td>
                <td style={{ fontSize: 10, color: "#64748b" }}>{line.lineType || "—"}</td>
                <td>{line.description}</td>
                <td className="mono" style={{ fontSize: 10, color: "#64748b" }}>
                  {line.hsCode || "—"}
                </td>
                <td className="right">{line.quantity}</td>
                <td className="right mono">{fmt(line.unitPrice, currency)}</td>
                <td className="center">{line.taxCode}</td>
                <td className="right">{line.taxPercent}%</td>
                <td className="right mono">{fmt(line.lineTotalExcl, currency)}</td>
                <td className="right mono">{fmt(line.vatAmount, currency)}</td>
                <td className="right mono" style={{ fontWeight: 600 }}>
                  {fmt(line.lineTotalIncl, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <table style={{ width: 280 }}>
            <tbody>
              <tr>
                <td style={{ border: "none", padding: "3px 0", color: "#64748b" }}>Subtotal (excl tax)</td>
                <td style={{ border: "none", padding: "3px 0", textAlign: "right" }} className="mono">
                  {fmt(invoice.subtotalExclTax, currency)}
                </td>
              </tr>
              <tr>
                <td style={{ border: "none", padding: "3px 0", color: "#64748b" }}>VAT Total</td>
                <td style={{ border: "none", padding: "3px 0", textAlign: "right" }} className="mono">
                  {fmt(invoice.totalVat, currency)}
                </td>
              </tr>
              <tr style={{ borderTop: "2px solid #111" }}>
                <td style={{ border: "none", padding: "6px 0 3px", fontWeight: 700, fontSize: 14 }}>GRAND TOTAL</td>
                <td
                  style={{ border: "none", padding: "6px 0 3px", textAlign: "right", fontWeight: 700, fontSize: 14 }}
                  className="mono"
                >
                  {fmt(invoice.totalAmount, currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {isZimraVerified && invoice.fiscalData && (
          <div
            style={{
              borderTop: "1px solid #e5e7eb",
              paddingTop: 12,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.05em",
                color: "#64748b",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              ZIMRA verification
            </div>
            <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 14 }}>
              <div style={{ flex: "0 0 auto" }}>
                {qrDataUrl && (
                  <>
                    <Image src={qrDataUrl} alt="ZIMRA QR" width={112} height={112} unoptimized />
                    <div style={{ fontSize: 8, color: "#64748b", marginTop: 4, maxWidth: 160 }}>
                      Scan to verify
                    </div>
                    {verifyUrl && /^https?:\/\//i.test(verifyUrl) && (
                      <div
                        className="mono"
                        style={{ fontSize: 7, color: "#2563eb", marginTop: 4, maxWidth: 240, wordBreak: "break-all" }}
                      >
                        {verifyUrl}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div style={{ flex: "1 1 160px", minWidth: 0, fontSize: 9, lineHeight: 1.45, color: "#334155" }}>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 8, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase" }}>
                    Submitted
                  </div>
                  <div>
                    {invoice.fiscalSubmittedAt
                      ? new Date(invoice.fiscalSubmittedAt).toLocaleString()
                      : "—"}
                  </div>
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 8, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase" }}>
                    Verification code
                  </div>
                  <div className="mono">{invoice.fiscalData.verificationCode || "—"}</div>
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 8, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase" }}>
                    FDMS invoice no.
                  </div>
                  <div className="mono">{invoice.fiscalData.fdmsInvoiceNo || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 8, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase" }}>
                    Fiscal day / receipt global
                  </div>
                  <div>
                    {invoice.fiscalData.fiscalDayNo ?? "—"} / {invoice.fiscalData.receiptGlobalNo || "—"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, color: "#64748b", borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
          <span>Payment Method: {invoice.paymentMethod}</span>
          {invoice.receiptNotes && <span style={{ marginLeft: 16 }}>Notes: {invoice.receiptNotes}</span>}
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: "#94a3b8", textAlign: "center" }}>
          This is a computer-generated document. No signature is required.
        </div>
      </div>
    </>
  );
}
