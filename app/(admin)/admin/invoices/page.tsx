"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Row = {
  id: string;
  invoiceNumber: string;
  quotationId: string;
  customerName: string;
  createdAt: string;
  subtotal: string;
  status: string;
};

type FilterKey = "all" | "draft" | "sent";

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

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
];

export default function AdminInvoicesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<FilterKey>("all");
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      status,
    });
    const res = await fetch(`/api/admin/invoices?${params}`);
    if (res.status === 401) {
      router.replace("/sign-in");
      return;
    }
    if (res.status === 403) {
      setError("You need admin access to view invoices.");
      setRows([]);
      return;
    }
    if (!res.ok) {
      setError("Could not load invoices.");
      setRows([]);
      return;
    }
    const json = (await res.json()) as {
      success: boolean;
      data: { rows: Row[]; total: number };
    };
    if (json.success && json.data) {
      setRows(json.data.rows);
      setTotal(json.data.total);
    } else {
      setRows([]);
    }
  }, [page, status, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (rows === null && !error) {
    return (
      <div className="flex flex-1 flex-col px-4 py-8 text-muted-foreground lg:px-6">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col px-4 py-8 text-red-600 lg:px-6">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mt-2 flex w-full items-center justify-between gap-1 px-4 lg:gap-2 lg:px-6">
        <div className="flex items-center gap-2">
          <Separator
            orientation="vertical"
            className="mx-2 data-[orientation=vertical]:h-4"
          />
          <h1 className="text-base font-medium">Invoices</h1>
        </div>
      </div>

      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <section className="mx-4 ml-6 mr-4 flex flex-wrap items-center gap-2 rounded-md bg-white p-3 lg:mx-6">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setPage(1);
                  setStatus(f.key);
                }}
                className={
                  status === f.key
                    ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    : "rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                }
              >
                {f.label}
              </button>
            ))}
          </section>

          <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-12 lg:px-6">
            <div className="overflow-hidden rounded-md border border-slate-200 bg-white lg:col-span-12">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Invoice #</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Quotation ID</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Subtotal</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(rows ?? []).map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                          {r.invoiceNumber}
                        </td>
                        <td className="px-4 py-3 text-slate-800">
                          {r.customerName}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {r.quotationId.slice(0, 10)}…
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {formatMoney(r.subtotal)}
                        </td>
                        <td className="px-4 py-3">
                          <InvoiceStatusBadge status={r.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/admin/invoices/${r.id}`}>View</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(rows ?? []).length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  No invoices found.
                </p>
              ) : null}
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
                <span>
                  Page {page} of {totalPages} ({total} total)
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
