"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { SalesTiles } from "@/components/pos/DayTotals";
import PosEmailInvoiceDialog from "@/components/pos/PosEmailInvoiceDialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { printSlip } from "@/lib/pos/print";
import { money } from "@/lib/pos/slip";
import type { PosAnalytics, CurrencyFigures } from "@/lib/services/posAnalytics.service";
import type { PosBranchDto } from "@/lib/services/posBranch.service";
import { cn } from "@/lib/utils";

interface SaleRow {
  _id: string;
  branchId: string;
  status: string;
  currency: "USD" | "ZWG";
  invoiceNumber?: string;
  provisionalNumber?: string;
  totalAmount: number;
  soldAt: string;
  soldDate: string;
  offline?: boolean;
  needsApproval?: boolean;
  lastError?: string;
  kind?: "SALE" | "CREDIT_NOTE";
  originalNumber?: string;
  creditNoteId?: string;
  buyer?: { registerName?: string; email?: string };
}

const harareDate = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const shift = (iso: string, days: number) => harareDate(new Date(Date.parse(iso) + days * 86_400_000));

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  FISCALISED: { label: "Fiscalised", tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  UNFISCALISED: { label: "Not fiscalised", tone: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  UNKNOWN: { label: "Checking device", tone: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  PENDING: { label: "Sending", tone: "bg-muted text-muted-foreground" },
  SUBMITTING: { label: "Sending", tone: "bg-muted text-muted-foreground" },
  FAILED: { label: "Rejected", tone: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
  VOIDED: { label: "Voided", tone: "bg-muted text-muted-foreground" },
};

const timeOf = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Harare", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

function Cell({ children, right, strong }: { children: React.ReactNode; right?: boolean; strong?: boolean }) {
  return <td className={cn("px-3 py-2", right && "text-right tabular-nums", strong && "font-semibold")}>{children}</td>;
}
function Head({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={cn("px-3 py-2 text-xs font-medium text-muted-foreground", right ? "text-right" : "text-left")}>{children}</th>;
}

const isCreditRow = (r: { kind?: string }) => r.kind === "CREDIT_NOTE";

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function PosSalesPage() {
  const today = harareDate();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [branches, setBranches] = useState<PosBranchDto[]>([]);
  const [data, setData] = useState<PosAnalytics | null>(null);
  const [rows, setRows] = useState<SaleRow[] | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [creditFor, setCreditFor] = useState<string | null>(null);
  const [creditReason, setCreditReason] = useState("");
  const [emailRow, setEmailRow] = useState<SaleRow | null>(null);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const r = await fetch("/api/pos/branches", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (ignore || !j?.success) return;
      setBranches(j.data);
      setIsAdmin(Boolean(j.meta?.isAdmin));
    })();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const q = new URLSearchParams({ from, to });
      if (branchId) q.set("branchId", branchId);
      try {
        const [a, s] = await Promise.all([
          fetch(`/api/pos/analytics?${q}`, { cache: "no-store" }).then((r) => r.json()),
          fetch(`/api/pos/sales?${q}&limit=500`, { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (ignore) return;
        if (!a.success) return setError(a.message ?? "Could not load sales");
        setError("");
        setData(a.data);
        setRows(s.success ? s.data : []);
      } catch {
        if (!ignore) setError("Could not reach the server");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [from, to, branchId, reloadKey]);

  const nameOf = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);
  const shown = useMemo(() => (rows ?? []).filter((r) => !status || (status === "attention" ? ["UNFISCALISED", "UNKNOWN", "FAILED"].includes(r.status) || r.needsApproval : r.status === status)), [rows, status]);

  async function fiscalise(r: SaleRow) {
    setBusy(r._id);
    try {
      const res = await fetch(`/api/pos/sales/${r._id}/fiscalise`, { method: "POST" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) toast.error(j?.message ?? "Could not fiscalise this sale");
      else if (j.data.status === "FISCALISED") toast.success(`Fiscalised as ${j.data.invoiceNumber}`);
      else toast.warning("The fiscal device is still unavailable");
      reload();
    } finally {
      setBusy(null);
    }
  }

  async function issueCredit(r: SaleRow) {
    setBusy(r._id);
    try {
      const res = await fetch(`/api/pos/sales/${r._id}/credit-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: creditReason.trim() || undefined }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) return toast.error(j?.message ?? "Could not issue the credit note");
      toast.success(`Credit note ${j.data.invoiceNumber ?? j.data.provisionalNumber} issued`);
      setCreditFor(null);
      setCreditReason("");
      reload();
      const b = branches.find((x) => x.id === r.branchId);
      if (b) void printSlip(j.data as never, b.pos.receipt);
    } finally {
      setBusy(null);
    }
  }

  function exportCsv() {
    const header = ["Date", "Time", "Branch", "Customer", "Document", "Number", "Provisional", "Original invoice", "Currency", "Total", "Status", "Offline sale"];
    const lines = shown.map((r) => [r.soldDate, timeOf(r.soldAt), nameOf.get(r.branchId) ?? r.branchId, r.buyer?.registerName ?? "Cash sale", r.kind === "CREDIT_NOTE" ? "Credit note" : "Sale", r.invoiceNumber ?? "", r.provisionalNumber ?? "", r.originalNumber ?? "", r.currency, r.totalAmount.toFixed(2), STATUS_LABEL[r.status]?.label ?? r.status, r.offline ? "yes" : ""]);
    const csv = [header, ...lines].map((l) => l.map(csvEscape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pos-sales-${from}${to !== from ? `_to_${to}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const preset = (f: string, t: string) => () => {
    setFrom(f);
    setTo(t);
  };
  const att = data?.attention;
  const needsAttention = att && att.unfiscalised + att.needsApproval + att.failed > 0;

  const Figures = ({ f }: { f: CurrencyFigures }) => (
    <>
      <Cell right>{f.fiscalised.count}</Cell>
      <Cell right>{money(f.fiscalised.total)}</Cell>
      <Cell right>{f.credit.count > 0 ? `${f.credit.count} · ${money(f.credit.total)}` : "–"}</Cell>
      <Cell right strong>
        {money(f.fiscalised.total + f.credit.total)}
      </Cell>
      <Cell right>{money(f.fiscalised.vat + f.credit.vat)}</Cell>
      <Cell right>{f.pending.count > 0 ? `${f.pending.count} · ${money(f.pending.total)}` : "–"}</Cell>
    </>
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">POS sales</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "All branches, or one branch." : "Your branch."} Dates are Harare time. Totals count fiscalised invoices; sales still waiting for a fiscal receipt are shown as pending.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="w-40" />
          </div>
          {isAdmin && (
            <div className="space-y-1.5">
              <Label htmlFor="branch">Branch</Label>
              <select
                id="branch"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="h-9 min-w-44 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Button size="sm" variant="outline" onClick={preset(today, today)}>
          Today
        </Button>
        <Button size="sm" variant="outline" onClick={preset(shift(today, -1), shift(today, -1))}>
          Yesterday
        </Button>
        <Button size="sm" variant="outline" onClick={preset(shift(today, -6), today)}>
          Last 7 days
        </Button>
        <Button size="sm" variant="outline" onClick={preset(`${today.slice(0, 8)}01`, today)}>
          This month
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {needsAttention && (
        <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <span className="font-medium">Needs attention</span>
          {att.unfiscalised > 0 && <span>{att.unfiscalised} not fiscalised yet</span>}
          {att.needsApproval > 0 && <span>{att.needsApproval} from an earlier day (administrator must fiscalise)</span>}
          {att.failed > 0 && <span>{att.failed} rejected by the device</span>}
          {att.offlinePending > 0 && <span>{att.offlinePending} made offline</span>}
          <button type="button" className="ml-auto underline underline-offset-4" onClick={() => setStatus("attention")}>
            Show them
          </button>
        </div>
      )}

      {data && <SalesTiles rows={data.totals} />}

      <section className="rounded-xl border bg-background">
        <h2 className="border-b px-3 py-2 text-sm font-medium">Totals</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <Head />
                <Head right>Invoices</Head>
                <Head right>Sales (incl. VAT)</Head>
                <Head right>Credit notes</Head>
                <Head right>Net</Head>
                <Head right>VAT (net)</Head>
                <Head right>Pending</Head>
              </tr>
            </thead>
            <tbody>
              {(["USD", "ZWG"] as const).map((c) => (
                <tr key={c} className="border-b last:border-0">
                  <Cell strong>{c}</Cell>
                  {data ? <Figures f={data.totals[c]} /> : <td className="px-3 py-2 text-muted-foreground" colSpan={6}>Loading…</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin && !branchId && (
        <section className="rounded-xl border bg-background">
          <h2 className="border-b px-3 py-2 text-sm font-medium">By branch</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <Head>Branch</Head>
                  <Head right>USD invoices</Head>
                  <Head right>USD net</Head>
                  <Head right>ZWG invoices</Head>
                  <Head right>ZWG net</Head>
                  <Head right>Pending</Head>
                </tr>
              </thead>
              <tbody>
                {data?.branches.map((b) => (
                  <tr key={b.branchId} className="border-b last:border-0">
                    <Cell strong>
                      {b.name}
                      {b.prefix && <span className="ml-2 text-xs font-normal text-muted-foreground">{b.prefix}</span>}
                    </Cell>
                    <Cell right>{b.USD.fiscalised.count}</Cell>
                    <Cell right strong>
                      {money(b.USD.fiscalised.total + b.USD.credit.total)}
                    </Cell>
                    <Cell right>{b.ZWG.fiscalised.count}</Cell>
                    <Cell right strong>
                      {money(b.ZWG.fiscalised.total + b.ZWG.credit.total)}
                    </Cell>
                    <Cell right>{b.USD.pending.count + b.ZWG.pending.count || "–"}</Cell>
                  </tr>
                ))}
                {data && data.branches.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      No sales in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && data.days.length > 1 && (
        <section className="rounded-xl border bg-background">
          <h2 className="border-b px-3 py-2 text-sm font-medium">By day (fiscalised, net of credit notes)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <Head>Date</Head>
                  <Head right>USD invoices</Head>
                  <Head right>USD total</Head>
                  <Head right>ZWG invoices</Head>
                  <Head right>ZWG total</Head>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={d.date} className="border-b last:border-0">
                    <Cell strong>{d.date}</Cell>
                    <Cell right>{d.USD.count}</Cell>
                    <Cell right>{money(d.USD.total)}</Cell>
                    <Cell right>{d.ZWG.count}</Cell>
                    <Cell right>{money(d.ZWG.total)}</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-2">
          <h2 className="text-sm font-medium">Sales</h2>
          <div className="flex items-center gap-2">
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <option value="">All statuses</option>
              <option value="attention">Needs attention</option>
              <option value="FISCALISED">Fiscalised</option>
              <option value="UNFISCALISED">Not fiscalised</option>
              <option value="FAILED">Rejected</option>
              <option value="VOIDED">Voided</option>
            </select>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={shown.length === 0}>
              Export CSV
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <Head>Invoice</Head>
                <Head>Customer</Head>
                <Head>When</Head>
                {isAdmin && !branchId && <Head>Branch</Head>}
                <Head right>Total</Head>
                <Head>Status</Head>
                <Head />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const st =
                  isCreditRow(r) && r.status === "FISCALISED"
                    ? { label: "Credit note", tone: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" }
                    : (STATUS_LABEL[r.status] ?? { label: r.status, tone: "bg-muted" });
                const canFiscalise = ["UNFISCALISED", "UNKNOWN"].includes(r.status);
                const isCredit = r.kind === "CREDIT_NOTE";
                const canCredit = r.status === "FISCALISED" && !isCredit && !r.creditNoteId;
                return (
                  <tr key={r._id} className="border-b last:border-0">
                    <Cell strong>
                      <Link href={`/pos-sales/${r._id}`} className="underline-offset-4 hover:underline">
                        {r.invoiceNumber ?? r.provisionalNumber ?? "—"}
                      </Link>
                      {r.invoiceNumber && r.provisionalNumber && !isCreditRow(r) && <span className="ml-2 text-xs font-normal text-muted-foreground">was {r.provisionalNumber}</span>}
                      {isCreditRow(r) && r.originalNumber && <span className="ml-2 text-xs font-normal text-muted-foreground">for {r.originalNumber}</span>}
                      {!isCreditRow(r) && r.creditNoteId && <span className="ml-2 text-xs font-normal text-muted-foreground">credited</span>}
                    </Cell>
                    <Cell>
                      {r.buyer?.registerName ? r.buyer.registerName : <span className="text-muted-foreground">Cash sale</span>}
                    </Cell>
                    <Cell>
                      <span className="tabular-nums">
                        {r.soldDate} {timeOf(r.soldAt)}
                      </span>
                      {r.offline && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">offline</span>}
                    </Cell>
                    {isAdmin && !branchId && <Cell>{nameOf.get(r.branchId) ?? "—"}</Cell>}
                    <Cell right strong>
                      {r.currency} {money(r.totalAmount)}
                    </Cell>
                    <Cell>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", st.tone)}>{st.label}</span>
                      {r.needsApproval && <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">earlier day</span>}
                      {r.status === "FAILED" && r.lastError && <div className="mt-1 max-w-sm truncate text-xs text-destructive">{r.lastError}</div>}
                      {creditFor === r._id && (
                        <form
                          className="mt-2 w-72 space-y-2 rounded-md border border-sky-200 bg-sky-50/60 p-2 dark:border-sky-900 dark:bg-sky-950/20"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void issueCredit(r);
                          }}
                        >
                          <p className="text-xs">Reverses the whole sale ({r.currency} {money(r.totalAmount)}). Can only be done once.</p>
                          <Input autoFocus value={creditReason} maxLength={200} onChange={(e) => setCreditReason(e.target.value)} placeholder="Reason (optional)" aria-label="Reason for the credit note" />
                          <div className="flex gap-2">
                            <Button size="sm" type="submit" disabled={busy === r._id}>
                              {busy === r._id ? "Issuing…" : "Issue credit note"}
                            </Button>
                            <Button size="sm" type="button" variant="ghost" onClick={() => setCreditFor(null)}>
                              Cancel
                            </Button>
                          </div>
                        </form>
                      )}
                    </Cell>
                    <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                      {["FISCALISED", "UNFISCALISED", "UNKNOWN"].includes(r.status) && (
                        <>
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/pos-sales/${r._id}`}>View</Link>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEmailRow(r)}>
                            Email
                          </Button>
                        </>
                      )}
                      {canCredit && (
                        <Button size="sm" variant="outline" onClick={() => { setCreditFor(creditFor === r._id ? null : r._id); setCreditReason(""); }}>
                          Credit note
                        </Button>
                      )}
                      {canFiscalise && (
                        <Button size="sm" disabled={busy === r._id || (r.needsApproval && !isAdmin)} onClick={() => void fiscalise(r)}>
                          {busy === r._id ? "Working…" : "Fiscalise"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows && shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    No sales match.
                  </td>
                </tr>
              )}
              {!rows && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows && rows.length === 500 && <p className="border-t px-3 py-2 text-xs text-muted-foreground">Showing the latest 500 sales. Narrow the dates or filter to see others.</p>}
      </section>

      <PosEmailInvoiceDialog
        open={!!emailRow}
        onClose={() => setEmailRow(null)}
        saleId={emailRow?._id ?? ""}
        defaultEmail={emailRow?.buyer?.email}
        customerName={emailRow?.buyer?.registerName}
      />
    </div>
  );
}
