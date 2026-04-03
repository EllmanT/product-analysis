"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { InvoiceQrPlaceholder } from "@/components/admin/InvoiceQrPlaceholder";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type InvItem = {
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

function InvoiceStatusBadge({ status }: { status: string }) {
  const base = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold";
  if (status === "draft") {
    return (
      <span className={`${base} bg-slate-200 text-slate-700`}>Draft</span>
    );
  }
  if (status === "sent") {
    return (
      <span className={`${base} bg-emerald-100 text-emerald-800`}>Sent</span>
    );
  }
  return <span className={`${base} bg-slate-100 text-slate-700`}>{status}</span>;
}

export default function AdminInvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [status, setStatus] = useState("");
  const [items, setItems] = useState<InvItem[]>([]);
  const [subtotal, setSubtotal] = useState("");
  const [qrCodeData, setQrCodeData] = useState("");
  const [customer, setCustomer] = useState<CustomerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError("You need admin access to view this invoice.");
      setLoading(false);
      return;
    }
    if (!res.ok) {
      setError("Invoice not found.");
      setLoading(false);
      return;
    }
    const json = (await res.json()) as {
      success: boolean;
      data: {
        invoice: {
          invoiceNumber: string;
          items: InvItem[];
          subtotal: string;
          qrCodeData: string;
          status: string;
          createdAt: string;
        };
        customer: CustomerPayload | null;
      };
    };
    if (json.success && json.data?.invoice) {
      const inv = json.data.invoice;
      setInvoiceNumber(inv.invoiceNumber);
      setItems(inv.items);
      setSubtotal(inv.subtotal);
      setQrCodeData(inv.qrCodeData);
      setStatus(inv.status);
      setCreatedAt(
        typeof inv.createdAt === "string"
          ? inv.createdAt
          : new Date(inv.createdAt as unknown as Date).toISOString()
      );
      setCustomer(json.data.customer);
    }
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markSent() {
    setMarking(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "sent" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Update failed");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Something went wrong");
    } finally {
      setMarking(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col px-4 py-8 text-muted-foreground lg:px-6">
        Loading…
      </div>
    );
  }

  if (error && !invoiceNumber) {
    return (
      <div className="flex flex-1 flex-col px-4 py-8 text-red-600 lg:px-6">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div
        className="no-print mx-4 mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 lg:mx-6"
        role="status"
      >
        ⚠️ QR code and invoice data are placeholders. Fiscalization integration
        is pending.
      </div>

      <div className="mt-2 flex w-full flex-wrap items-center gap-2 px-4 no-print lg:px-6">
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/admin/invoices" className="hover:text-foreground">
            Invoices
          </Link>
          <span aria-hidden>/</span>
          <span className="font-mono text-xs text-slate-900">
            {invoiceNumber}
          </span>
        </nav>
      </div>

      <div id="invoice-print-area" className="flex flex-col gap-4 px-4 py-6 lg:px-6">
        {error ? (
          <p className="text-sm text-red-600 no-print" role="alert">
            {error}
          </p>
        ) : null}

        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">Invoice Number</p>
              <p className="font-mono text-2xl font-bold tracking-tight text-slate-900">
                {invoiceNumber}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Date: {new Date(createdAt).toLocaleString()}
              </p>
            </div>
            <InvoiceStatusBadge status={status} />
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Customer details
          </h2>
          {customer ? (
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
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
                <dt className="text-slate-500">TIN / VAT</dt>
                <dd className="text-slate-800">
                  {customer.tinNumber} / {customer.vatNumber}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Address</dt>
                <dd className="text-slate-800">{customer.address}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No customer data.</p>
          )}
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Items</h2>
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
                    <td className="py-3 pr-4 text-slate-700">{row.quantity}</td>
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

        <div className="flex flex-col items-center rounded-md border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-700">
            Invoice QR Code (Placeholder)
          </p>
          <div className="mt-4">
            <InvoiceQrPlaceholder data={qrCodeData || invoiceNumber} />
          </div>
        </div>

        <div className="no-print flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
          >
            Print Invoice
          </Button>
          {status === "draft" ? (
            <Button
              type="button"
              className="bg-blue-600 text-white hover:bg-blue-700"
              disabled={marking}
              onClick={() => void markSent()}
            >
              {marking ? "Updating…" : "Mark as Sent"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
