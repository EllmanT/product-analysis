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

function QuotationStatusBadge({ status }: { status: string }) {
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
  const [customer, setCustomer] = useState<CustomerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        };
        customer: CustomerPayload | null;
      };
    };
    if (json.success && json.data?.quotation) {
      setItems(json.data.quotation.items);
      setSubtotal(json.data.quotation.subtotal);
      setStatus(json.data.quotation.status);
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

  if (loading) {
    return (
      <div className="flex flex-1 flex-col px-4 py-8 text-muted-foreground lg:px-6">
        Loading…
      </div>
    );
  }

  if (error && !customer) {
    return (
      <div className="flex flex-1 flex-col px-4 py-8 text-red-600 lg:px-6">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
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
          <span className="font-mono text-xs text-slate-900">{id.slice(0, 12)}…</span>
        </nav>
      </div>

      <div className="flex flex-col gap-4 px-4 py-6 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600">Status</span>
            <QuotationStatusBadge status={status} />
          </div>
          {status === "confirmed" ? (
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700"
              disabled={generating}
              onClick={() => void generateInvoice()}
            >
              {generating ? "Generating…" : "Generate Invoice"}
            </Button>
          ) : null}
        </div>

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              Customer Details
            </h2>
            {customer ? (
              <dl className="mt-4 space-y-2 text-sm">
                <div>
                  <dt className="text-slate-500">Name</dt>
                  <dd className="font-medium text-slate-900">
                    {[customer.firstName, customer.lastName]
                      .filter(Boolean)
                      .join(" ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Trade name</dt>
                  <dd className="text-slate-800">{customer.tradeName}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Email</dt>
                  <dd className="text-slate-800">{customer.email}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Phone</dt>
                  <dd className="text-slate-800">{customer.phone}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">TIN</dt>
                  <dd className="text-slate-800">{customer.tinNumber}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">VAT</dt>
                  <dd className="text-slate-800">{customer.vatNumber}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Address</dt>
                  <dd className="text-slate-800">{customer.address}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-slate-500">No customer data.</p>
            )}
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              Order Items
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-600">
                  <tr>
                    <th className="py-2 pr-4">Product</th>
                    <th className="py-2 pr-4">Code</th>
                    <th className="py-2 pr-4">Qty</th>
                    <th className="py-2 pr-4">Unit price</th>
                    <th className="py-2">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((row) => (
                    <tr key={`${row.productId}-${row.standardCode}`}>
                      <td className="py-3 pr-4 font-medium text-slate-900">
                        {row.name}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-600">
                        {row.standardCode}
                      </td>
                      <td className="py-3 pr-4 text-slate-700">
                        {row.quantity}
                      </td>
                      <td className="py-3 pr-4 text-slate-700">
                        {formatMoney(row.unitPrice)}
                      </td>
                      <td className="py-3 font-semibold text-slate-900">
                        {formatMoney(row.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-lg font-bold text-slate-900">
              Subtotal: {formatMoney(subtotal)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
