"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type QItem = {
  productId: string;
  name: string;
  standardCode: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
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

function formatMoney(s: string): string {
  const n = parseFloat(s);
  if (Number.isNaN(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function QuotationStatusBadge({ status }: { status: string }) {
  const base = "inline-flex rounded-[6px] px-2.5 py-0.5 text-xs font-semibold";
  if (status === "pending") {
    return <span className={`${base} bg-blue-100 text-blue-800`}>Quote issued</span>;
  }
  if (status === "confirmed") {
    return (
      <span className={`${base} bg-amber-100 text-amber-800`}>Ready to pay</span>
    );
  }
  if (status === "invoiced") {
    return (
      <span className={`${base} bg-purple-100 text-purple-800`}>Invoiced</span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className={`${base} bg-slate-200 text-slate-700`}>Cancelled</span>
    );
  }
  return <span className={`${base} bg-slate-100 text-slate-700`}>{status}</span>;
}

export default function AdminQuotationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";

  const [items, setItems] = useState<QItem[]>([]);
  const [subtotal, setSubtotal] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<string | null>(null);
  const [fulfillmentStatus, setFulfillmentStatus] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refId = id.length >= 8 ? id.slice(-8).toUpperCase() : id.toUpperCase();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/quotations/${id}`);
    if (res.status === 401) {
      router.replace("/sign-in");
      return;
    }
    if (res.status === 403) {
      setError("You need admin access to view this quotation.");
      setLoading(false);
      return;
    }
    if (!res.ok) {
      setError("Quotation not found.");
      setLoading(false);
      return;
    }
    const json = (await res.json()) as {
      success: boolean;
      data: {
        quotation: {
          items: QItem[];
          subtotal: string;
          status: string;
          paymentStatus: string;
          createdAt: string;
          checkoutPaymentMethod: string | null;
          fulfillmentStatus: string | null;
        };
        customer: CustomerPayload | null;
      };
    };
    if (json.success && json.data?.quotation) {
      const q = json.data.quotation;
      setItems(q.items);
      setSubtotal(q.subtotal);
      setStatus(q.status);
      setPaymentStatus(q.paymentStatus);
      setCreatedAt(q.createdAt);
      setCheckoutPaymentMethod(q.checkoutPaymentMethod ?? null);
      setFulfillmentStatus(q.fulfillmentStatus ?? null);
      setCustomer(json.data.customer);
    }
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generateInvoice() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotationId: id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not create invoice");
        return;
      }
      const invId = json?.data?._id as string | undefined;
      if (invId) {
        router.push(`/admin/invoices/${invId}`);
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  async function confirmDelivery() {
    setDelivering(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/quotations/${id}/confirm-delivery`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not confirm delivery");
        return;
      }
      await load();
    } catch {
      setError("Something went wrong");
    } finally {
      setDelivering(false);
    }
  }

  const showCodDelivered =
    checkoutPaymentMethod === "cod" &&
    fulfillmentStatus === "pending" &&
    paymentStatus === "unpaid";

  const showManualInvoice =
    status === "confirmed" &&
    paymentStatus === "unpaid" &&
    !showCodDelivered;

  if (loading) {
    return (
      <div className="flex flex-1 flex-col px-4 py-8 text-muted-foreground lg:px-6">
        Loading…
      </div>
    );
  }

  if (error && !customer && !items.length) {
    return (
      <div className="flex flex-1 flex-col px-4 py-8 text-red-600 lg:px-6">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-[#f8fafc]">
      <div className="mt-2 flex w-full flex-wrap items-center gap-2 px-4 lg:px-6">
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/admin/quotations" className="hover:text-foreground">
            Quotations
          </Link>
          <span aria-hidden>/</span>
          <span className="font-mono text-xs text-slate-900">#{refId}</span>
        </nav>
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-3 lg:px-6">
        {error ? (
          <p className="lg:col-span-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="space-y-0 lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <div className="bg-[#1e3a5f] px-6 py-6 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-200/95">
                Quotation
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight">#{refId}</h1>
              {createdAt ? (
                <p className="mt-1 text-sm text-blue-100/90">{fmtDate(createdAt)}</p>
              ) : null}
            </div>

            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Bill to
              </h2>
              {customer ? (
                <div className="mt-3 text-sm">
                  <p className="font-semibold text-slate-900">
                    {[customer.firstName, customer.lastName].filter(Boolean).join(" ")}
                  </p>
                  <p className="text-slate-700">{customer.tradeName}</p>
                  <p className="mt-2 text-slate-600">{customer.email}</p>
                  <p className="text-slate-600">{customer.phone}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    TIN {customer.tinNumber} · VAT {customer.vatNumber}
                  </p>
                  <p className="mt-1 text-slate-600">{customer.address}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">No customer data.</p>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Product</th>
                    <th className="px-6 py-3">SKU</th>
                    <th className="px-6 py-3 text-center">Qty</th>
                    <th className="px-6 py-3 text-right">Unit</th>
                    <th className="px-6 py-3 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr
                      key={`${row.productId}-${row.standardCode}`}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-6 py-3 font-medium text-slate-900">{row.name}</td>
                      <td className="px-6 py-3 font-mono text-xs text-slate-600">
                        {row.standardCode}
                      </td>
                      <td className="px-6 py-3 text-center text-slate-700">{row.quantity}</td>
                      <td className="px-6 py-3 text-right text-slate-700">
                        {formatMoney(row.unitPrice)}
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-slate-900">
                        {formatMoney(row.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-100 px-6 py-4">
              <div className="ml-auto w-full max-w-xs space-y-1">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-medium text-slate-900">{formatMoney(subtotal)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                  <span>Total</span>
                  <span className="text-[#1E40AF]">{formatMoney(subtotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Status
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <QuotationStatusBadge status={status} />
              {paymentStatus === "paid" ? (
                <span className="inline-flex rounded-[6px] bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                  Paid
                </span>
              ) : (
                <span className="inline-flex rounded-[6px] bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                  Unpaid
                </span>
              )}
            </div>
            {checkoutPaymentMethod ? (
              <p className="mt-3 text-xs text-slate-600">
                Payment method:{" "}
                <span className="font-medium text-slate-800">
                  {checkoutPaymentMethod === "cod"
                    ? "Cash on delivery"
                    : checkoutPaymentMethod === "card"
                      ? "Card"
                      : "EcoCash"}
                </span>
              </p>
            ) : null}
            {checkoutPaymentMethod === "cod" && fulfillmentStatus ? (
              <p className="mt-1 text-xs text-slate-600">
                Delivery:{" "}
                <span className="font-medium capitalize">{fulfillmentStatus}</span>
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Actions</p>
            <div className="mt-3 flex flex-col gap-2">
              {showCodDelivered ? (
                <Button
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={delivering}
                  onClick={() => void confirmDelivery()}
                >
                  {delivering ? "Confirming…" : "Confirm delivery & issue invoice"}
                </Button>
              ) : null}
              {showManualInvoice ? (
                <Button
                  className="w-full bg-blue-600 text-white hover:bg-blue-700"
                  disabled={generating}
                  onClick={() => void generateInvoice()}
                >
                  {generating ? "Generating…" : "Generate invoice (manual fallback)"}
                </Button>
              ) : null}
              {!showCodDelivered && !showManualInvoice ? (
                <p className="text-xs text-slate-500">
                  Invoices are created automatically after online payment or COD delivery
                  confirmation when fiscalization succeeds.
                </p>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
