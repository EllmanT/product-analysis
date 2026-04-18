"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";

type InvLine = {
  lineNo: number;
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
        if (r.status === 401) { router.replace("/sign-in"); return null; }
        return r.json() as Promise<{ success: boolean; data: { invoice: InvoiceDetail; seller: Seller } }>;
      })
      .then((json) => {
        if (json?.success && json.data?.invoice) {
          setInvoice(json.data.invoice);
          setSeller(json.data.seller ?? null);
          const qrSource = json.data.invoice.fiscalData?.verificationLink || json.data.invoice.fiscalData?.qrCodeUrl;
          if (qrSource) {
            QRCode.toDataURL(qrSource, { errorCorrectionLevel: "M", width: 180, margin: 1 })
              .then((url) => setQrDataUrl(url))
              .catch(() => {});
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, router]);

  // Auto-print once loaded
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
  const isFiscalized = invoice.isFiscalized || invoice.fiscalStatus === "SUBMITTED";

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
          onClick={() => window.print()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Print
        </button>
        <button
          onClick={() => window.close()}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
      </div>

      <div className="page">
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#064E3B" }}>STOCKFLOW</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{seller?.tradeName || seller?.legalName || ""}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{receiptTypeLabel(invoice.receiptType)}</div>
            <div className="mono" style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{invoice.invoiceNumber}</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>{new Date(invoice.receiptDate ?? invoice.createdAt).toLocaleDateString()}</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>{currency} · {invoice.paymentMethod}</div>
          </div>
        </div>

        {/* Seller + Buyer */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4, textTransform: "uppercase" }}>Seller</div>
            {seller?.legalName && <div><strong>{seller.legalName}</strong></div>}
            {seller?.tradeName && seller.tradeName !== seller.legalName && <div style={{ color: "#6b7280" }}>{seller.tradeName}</div>}
            {seller?.tin && <div>TIN: <span className="mono">{seller.tin}</span></div>}
            {seller?.vatNumber && <div>VAT: <span className="mono">{seller.vatNumber}</span></div>}
            {seller?.address && <div>{seller.address}</div>}
            {seller?.city && <div>{seller.city}{seller.region ? `, ${seller.region}` : ""}</div>}
            {seller?.phone && <div>Tel: {seller.phone}</div>}
            {seller?.email && <div>{seller.email}</div>}
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4, textTransform: "uppercase" }}>Bill To</div>
            {invoice.buyerSnapshot?.registerName && <div><strong>{invoice.buyerSnapshot.registerName}</strong></div>}
            {invoice.buyerSnapshot?.tradeName && invoice.buyerSnapshot.tradeName !== invoice.buyerSnapshot.registerName && (
              <div style={{ color: "#6b7280" }}>{invoice.buyerSnapshot.tradeName}</div>
            )}
            {invoice.buyerSnapshot?.tin && <div>TIN: <span className="mono">{invoice.buyerSnapshot.tin}</span></div>}
            {invoice.buyerSnapshot?.vatNumber && <div>VAT: <span className="mono">{invoice.buyerSnapshot.vatNumber}</span></div>}
            {invoice.buyerSnapshot?.email && <div>{invoice.buyerSnapshot.email}</div>}
            {invoice.buyerSnapshot?.phone && <div>Tel: {invoice.buyerSnapshot.phone}</div>}
            {invoice.buyerSnapshot?.address && <div>{invoice.buyerSnapshot.address}</div>}
            {invoice.buyerSnapshot?.city && <div>{invoice.buyerSnapshot.city}{invoice.buyerSnapshot.province ? `, ${invoice.buyerSnapshot.province}` : ""}</div>}
          </div>
        </div>

        {/* Line Items */}
        <table style={{ marginBottom: 16 }}>
          <thead>
            <tr>
              <th style={{ width: 30 }}>#</th>
              <th>Description</th>
              <th style={{ width: 70 }}>HS Code</th>
              <th style={{ width: 50 }} className="right">Qty</th>
              <th style={{ width: 90 }} className="right">Unit Price</th>
              <th style={{ width: 60 }} className="center">Tax</th>
              <th style={{ width: 70 }} className="right">Tax%</th>
              <th style={{ width: 80 }} className="right">VAT Amt</th>
              <th style={{ width: 90 }} className="right">Total (Incl)</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.lineNo}>
                <td>{line.lineNo}</td>
                <td>{line.description}</td>
                <td className="mono" style={{ fontSize: 10, color: "#6b7280" }}>{line.hsCode || "—"}</td>
                <td className="right">{line.quantity}</td>
                <td className="right mono">{fmt(line.unitPrice, currency)}</td>
                <td className="center">{line.taxCode}</td>
                <td className="right">{line.taxPercent}%</td>
                <td className="right mono">{fmt(line.vatAmount, currency)}</td>
                <td className="right mono" style={{ fontWeight: 600 }}>{fmt(line.lineTotalIncl, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <table style={{ width: 280 }}>
            <tbody>
              <tr>
                <td style={{ border: "none", padding: "3px 0", color: "#6b7280" }}>Subtotal (excl tax)</td>
                <td style={{ border: "none", padding: "3px 0", textAlign: "right" }} className="mono">{fmt(invoice.subtotalExclTax, currency)}</td>
              </tr>
              <tr>
                <td style={{ border: "none", padding: "3px 0", color: "#6b7280" }}>VAT Total</td>
                <td style={{ border: "none", padding: "3px 0", textAlign: "right" }} className="mono">{fmt(invoice.totalVat, currency)}</td>
              </tr>
              <tr style={{ borderTop: "2px solid #111" }}>
                <td style={{ border: "none", padding: "6px 0 3px", fontWeight: 700, fontSize: 14 }}>GRAND TOTAL</td>
                <td style={{ border: "none", padding: "6px 0 3px", textAlign: "right", fontWeight: 700, fontSize: 14 }} className="mono">{fmt(invoice.totalAmount, currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Fiscal Verification Block */}
        {isFiscalized && invoice.fiscalData && (
          <div style={{ border: "2px solid #059669", borderRadius: 8, padding: "12px 16px", marginBottom: 16, background: "#f0fdf4" }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#065f46", marginBottom: 8 }}>✓ FISCALLY VERIFIED — ZIMRA</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
              <div>
                <span style={{ color: "#6b7280" }}>Verification Code: </span>
                <span className="mono" style={{ fontWeight: 600 }}>{invoice.fiscalData.verificationCode || "—"}</span>
              </div>
              <div>
                <span style={{ color: "#6b7280" }}>FDMS Invoice No: </span>
                <span className="mono" style={{ fontWeight: 600 }}>{invoice.fiscalData.fdmsInvoiceNo || "—"}</span>
              </div>
              <div>
                <span style={{ color: "#6b7280" }}>Fiscal Day No: </span>
                <span style={{ fontWeight: 600 }}>{invoice.fiscalData.fiscalDayNo ?? "—"}</span>
              </div>
              <div>
                <span style={{ color: "#6b7280" }}>Receipt Global No: </span>
                <span style={{ fontWeight: 600 }}>{invoice.fiscalData.receiptGlobalNo || "—"}</span>
              </div>
            </div>
            {qrDataUrl && (
              <div style={{ marginTop: 12, textAlign: "center" }}>
                <Image src={qrDataUrl} alt="ZIMRA QR" width={130} height={130} style={{ margin: "0 auto", border: "1px solid #d1fae5", padding: 4 }} />
                <div style={{ fontSize: 10, color: "#065f46", marginTop: 4 }}>Scan to verify this invoice on ZIMRA</div>
              </div>
            )}
          </div>
        )}

        {/* Payment method + notes */}
        <div style={{ fontSize: 11, color: "#6b7280", borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
          <span>Payment Method: {invoice.paymentMethod}</span>
          {invoice.receiptNotes && <span style={{ marginLeft: 16 }}>Notes: {invoice.receiptNotes}</span>}
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: "#9ca3af", textAlign: "center" }}>
          This is a computer-generated document. No signature is required.
        </div>
      </div>
    </>
  );
}
