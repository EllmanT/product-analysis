"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type InvoiceItem = {
  name: string;
  standardCode: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
};

type InvoiceData = {
  _id: string;
  invoiceNumber: string;
  quotationId: string;
  items: InvoiceItem[];
  subtotal: string;
  status: string;
  createdAt: string;
};

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtMoney(s: string): string {
  const n = parseFloat(s);
  return `$${isNaN(n) ? "0.00" : n.toFixed(2)}`;
}

export default function InvoiceDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/shop/account/invoices/${id}`, { credentials: "include" });
      if (res.status === 401) { router.replace(`/login?redirect=/account/invoices/${id}`); return; }
      if (res.status === 404) { router.replace("/account/invoices"); return; }
      if (res.ok) {
        const json = await res.json() as { success: boolean; data: InvoiceData };
        if (json.success) setInvoice(json.data);
      }
      setLoading(false);
    })();
  }, [id, router]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-slate-500">Loading…</div>;
  }

  if (!invoice) return null;

  const pdfUrl = `/api/shop/account/invoices/${invoice._id}/pdf`;

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

        {/* Invoice card */}
        <div className="relative overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.06)]">

          {/* PAID stamp */}
          <div
            className="pointer-events-none absolute right-6 top-20 rotate-[15deg] select-none rounded border-2 border-[#059669] px-3 py-1 text-lg font-bold tracking-widest text-[#059669] opacity-20"
            aria-hidden
          >
            PAID ✓
          </div>

          {/* Header band */}
          <div className="bg-[#064E3B] px-6 py-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xl font-bold tracking-wider text-white">STOCKFLOW</p>
                <p className="mt-0.5 text-xs text-[#6EE7B7]">TAX INVOICE</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-white">{invoice.invoiceNumber}</p>
                <p className="text-xs text-[#6EE7B7]">{fmtDate(invoice.createdAt)}</p>
              </div>
            </div>
          </div>

          {/* Details block */}
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invoice Date</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{fmtDate(invoice.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</p>
                <span className="mt-1 inline-flex items-center rounded-[6px] bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                  Paid
                </span>
              </div>
            </div>
          </div>

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
                    <td className="px-6 py-3 text-right text-slate-700">{fmtMoney(item.unitPrice)}</td>
                    <td className="px-6 py-3 text-right font-semibold text-slate-900">{fmtMoney(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-6 py-5">
            <div className="ml-auto w-fit space-y-1">
              <div className="flex justify-between gap-16 text-sm text-slate-600">
                <span>Subtotal</span>
                <span className="font-medium">{fmtMoney(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between gap-16 border-t border-slate-200 pt-2 text-base font-bold">
                <span className="text-slate-900">Total</span>
                <span style={{ color: "#059669" }}>{fmtMoney(invoice.subtotal)}</span>
              </div>
            </div>
          </div>

          {/* Download button */}
          <div className="border-t border-slate-100 px-6 py-5">
            <a
              href={pdfUrl}
              download
              className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#064E3B] py-3 text-sm font-semibold text-white transition hover:bg-[#065F46]"
            >
              Download PDF
            </a>
          </div>

        </div>
      </div>
    </div>
  );
}
