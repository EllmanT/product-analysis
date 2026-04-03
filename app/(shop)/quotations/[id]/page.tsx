"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type QItem = {
  productId: string;
  name: string;
  standardCode: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
};

type QuotationPayload = {
  _id: string;
  items: QItem[];
  subtotal: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
};

type CustomerPayload = {
  tradeName: string;
  tinNumber: string;
  vatNumber: string;
  phone: string;
  address: string;
  email: string;
  firstName: string;
  lastName: string;
};

function StatusBadge({ status }: { status: string }) {
  const base = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold";
  if (status === "pending") {
    return (
      <span className={`${base} bg-blue-100 text-blue-800`}>Pending</span>
    );
  }
  if (status === "confirmed") {
    return (
      <span className={`${base} bg-emerald-100 text-emerald-800`}>
        Confirmed
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className={`${base} bg-slate-200 text-slate-700`}>Cancelled</span>
    );
  }
  if (status === "invoiced") {
    return (
      <span className={`${base} bg-purple-100 text-purple-800`}>Invoiced</span>
    );
  }
  return <span className={`${base} bg-slate-100 text-slate-700`}>{status}</span>;
}

export default function QuotationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";

  const [quotation, setQuotation] = useState<QuotationPayload | null>(null);
  const [customer, setCustomer] = useState<CustomerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/shop/quotations/${id}`, {
      credentials: "include",
    });
    if (res.status === 401) {
      router.replace(`/login?redirect=/quotations/${id}`);
      return;
    }
    if (!res.ok) {
      setError("Quotation not found.");
      setQuotation(null);
      setLoading(false);
      return;
    }
    const json = (await res.json()) as {
      success: boolean;
      data: { quotation: QuotationPayload; customer: CustomerPayload | null };
    };
    if (json.success && json.data?.quotation) {
      setQuotation(json.data.quotation);
      setCustomer(json.data.customer);
    }
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmOrder() {
    if (!id) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`/api/shop/quotations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "confirm" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not confirm order");
        return;
      }
      await load();
    } catch {
      setError("Something went wrong");
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-slate-600">
        Loading quotation…
      </div>
    );
  }

  if (error && !quotation) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-red-600">{error}</p>
        <Link
          href="/quotations"
          className="mt-6 inline-block text-sm font-semibold text-[#2563EB] hover:underline"
        >
          Back to quotations
        </Link>
      </div>
    );
  }

  if (!quotation) return null;

  const shortId = quotation._id.slice(-8).toUpperCase();

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
@media print {
  header { display: none !important; }
  footer { display: none !important; }
  .no-print { display: none !important; }
  body { background: white !important; }
  .print-root { padding: 0 !important; margin: 0 !important; max-width: none !important; }
}
`,
        }}
      />

      <div className="print-root mx-auto max-w-5xl px-4 py-10 lg:px-6">
        <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/quotations"
              className="text-sm font-medium text-[#2563EB] hover:underline"
            >
              ← My quotations
            </Link>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              Quotation #{shortId}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Full ID:{" "}
              <span className="font-mono text-xs">{quotation._id}</span>
            </p>
          </div>
          <StatusBadge status={quotation.status} />
        </div>

        <div className="mb-8 hidden border-b border-slate-200 pb-6 print:block">
          <h1 className="text-2xl font-bold text-slate-900">
            Quotation #{shortId}
          </h1>
          <p className="text-sm text-slate-600">
            {new Date(quotation.createdAt).toLocaleString()}
          </p>
        </div>

        {customer ? (
          <section className="mb-8 rounded-xl bg-white p-6 shadow-sm print:shadow-none print:ring-1 print:ring-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Customer details</h2>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Trade name</dt>
                <dd className="font-medium text-slate-900">{customer.tradeName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd className="font-medium text-slate-900">{customer.email}</dd>
              </div>
              <div>
                <dt className="text-slate-500">TIN</dt>
                <dd className="font-mono text-slate-900">{customer.tinNumber}</dd>
              </div>
              <div>
                <dt className="text-slate-500">VAT</dt>
                <dd className="font-mono text-slate-900">{customer.vatNumber}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Phone</dt>
                <dd className="text-slate-900">{customer.phone}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Address</dt>
                <dd className="text-slate-900">{customer.address}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-xl bg-white shadow-sm print:shadow-none print:ring-1 print:ring-slate-200">
          <h2 className="border-b border-slate-100 px-6 py-4 text-lg font-bold text-slate-900">
            Line items
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-6 py-3 font-semibold">Product</th>
                  <th className="px-6 py-3 font-semibold">Code</th>
                  <th className="px-6 py-3 font-semibold">Qty</th>
                  <th className="px-6 py-3 font-semibold">Unit price</th>
                  <th className="px-6 py-3 font-semibold">Line total</th>
                </tr>
              </thead>
              <tbody>
                {quotation.items.map((row, idx) => (
                  <tr
                    key={`${row.productId}-${idx}`}
                    className={idx % 2 === 1 ? "bg-slate-50/80" : "bg-white"}
                  >
                    <td className="px-6 py-3 font-medium text-slate-900">
                      {row.name}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {row.standardCode}
                    </td>
                    <td className="px-6 py-3 text-slate-800">{row.quantity}</td>
                    <td className="px-6 py-3 text-slate-700">
                      ${parseFloat(row.unitPrice).toFixed(2)}
                    </td>
                    <td className="px-6 py-3 font-semibold text-slate-900">
                      ${parseFloat(row.lineTotal).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-white">
                  <td
                    colSpan={4}
                    className="px-6 py-4 text-right text-base font-bold text-slate-900"
                  >
                    Total
                  </td>
                  <td className="px-6 py-4 text-base font-bold text-slate-900">
                    ${parseFloat(quotation.subtotal).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <div className="no-print mt-8 flex flex-wrap gap-3">
          {quotation.status === "pending" ? (
            <button
              type="button"
              disabled={confirming}
              onClick={() => void confirmOrder()}
              className="rounded-lg bg-[#2563EB] px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
            >
              {confirming ? "Confirming…" : "Confirm Order"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border-2 border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            Download Quotation
          </button>
        </div>

        {error && quotation ? (
          <p className="no-print mt-4 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </>
  );
}
