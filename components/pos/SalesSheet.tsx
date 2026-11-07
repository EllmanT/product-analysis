"use client";

import { SalesTiles, type QueuedTotal, type TotalsRow } from "@/components/pos/DayTotals";
import { Loader2, Mail, Printer, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { QueuedSale } from "@/lib/pos/offlineStore";
import { printSlip } from "@/lib/pos/print";
import { money } from "@/lib/pos/slip";
import type { PosBranchDto } from "@/lib/services/posBranch.service";
import { cn } from "@/lib/utils";

export interface SaleRow {
  _id: string;
  status: "PENDING" | "SUBMITTING" | "FISCALISED" | "UNFISCALISED" | "UNKNOWN" | "FAILED" | "VOIDED";
  currency: "USD" | "ZWG";
  paymentMethod: string;
  invoiceNumber?: string;
  provisionalNumber?: string;
  totalAmount: number;
  totalVat: number;
  subtotalExclTax: number;
  lines: {
    description: string;
    quantity: number;
    unitPrice: number;
    taxPercent: number;
    vatAmount: number;
    lineTotalExcl: number;
    lineTotalIncl: number;
  }[];
  buyer?: { registerName?: string; tin?: string; email?: string };
  soldAt: string;
  needsApproval?: boolean;
  lastError?: string;
  kind?: "SALE" | "CREDIT_NOTE";
  originalNumber?: string;
  creditReason?: string;
  /** set on a sale once a credit note has been issued against it */
  creditNoteId?: string;
  fiscal?: {
    verificationCode?: string;
    verificationLink?: string;
    qrCodeUrl?: string;
    fiscalDayNo?: number | null;
    receiptGlobalNo?: string;
    deviceId?: string;
    deviceSerialNumber?: string;
    receiptDate?: string;
  };
}

const STATUS: Record<SaleRow["status"], { label: string; tone: string }> = {
  FISCALISED: { label: "Issued", tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  UNFISCALISED: { label: "Saved, sending", tone: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  UNKNOWN: { label: "Sending", tone: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  PENDING: { label: "Sending", tone: "bg-muted text-muted-foreground" },
  SUBMITTING: { label: "Sending", tone: "bg-muted text-muted-foreground" },
  FAILED: { label: "Needs attention", tone: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
  VOIDED: { label: "Voided", tone: "bg-muted text-muted-foreground" },
};

async function fetchRows(branchId: string): Promise<SaleRow[] | null> {
  try {
    const r = await fetch(`/api/pos/sales?branchId=${branchId}&limit=200`, { cache: "no-store" });
    const j = await r.json();
    return j.success ? (j.data as SaleRow[]) : null;
  } catch {
    return null;
  }
}

const time = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Harare", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

interface Props {
  /** The branch's totals for today, shown as the heading. */
  totals?: Partial<Record<"USD" | "ZWG", TotalsRow>>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch: PosBranchDto;
  onChanged: () => void;
  /** Sales saved on this till while the server was unreachable. */
  queued?: QueuedSale[];
  reachable?: boolean;
  /** Supervisors (not cashiers) may issue credit notes. */
  canCredit?: boolean;
  /** Administrators see the fiscal controls; cashiers do not. */
  isAdmin?: boolean;
}

export default function SalesSheet({ totals, open, onOpenChange, branch, onChanged, queued = [], reachable = true, canCredit = false, isAdmin = false }: Props) {
  const [rows, setRows] = useState<SaleRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [emailFor, setEmailFor] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [creditFor, setCreditFor] = useState<string | null>(null);
  const [creditReason, setCreditReason] = useState("");

  const load = useCallback(async () => {
    const data = await fetchRows(branch.id);
    if (data) setRows(data);
  }, [branch.id]);

  const refresh = async () => {
    setLoading(true);
    await load();
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    const tick = async () => {
      const data = await fetchRows(branch.id);
      if (!ignore && data) setRows(data);
    };
    void tick();
    const t = setInterval(() => void tick(), 10_000);
    return () => {
      ignore = true;
      clearInterval(t);
    };
  }, [open, branch.id]);

  const fiscalise = async (row: SaleRow) => {
    setBusy(row._id);
    try {
      const r = await fetch(`/api/pos/sales/${row._id}/fiscalise`, { method: "POST" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) toast.error(j?.message ?? "Could not fiscalise this sale");
      else if (j.data.status === "FISCALISED") toast.success(`Fiscalised as ${j.data.invoiceNumber}`);
      else toast.warning("Fiscal device still unavailable. It will keep retrying.");
      await load();
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const issueCredit = async (row: SaleRow) => {
    setBusy(row._id);
    try {
      const r = await fetch(`/api/pos/sales/${row._id}/credit-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: creditReason.trim() || undefined }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) {
        toast.error(j?.message ?? "Could not issue the credit note");
        return;
      }
      toast.success(`Credit note ${j.data.invoiceNumber ?? j.data.provisionalNumber} issued`);
      setCreditFor(null);
      setCreditReason("");
      await load();
      onChanged();
      void printSlip(j.data as never, branch.pos.receipt);
    } finally {
      setBusy(null);
    }
  };

  const sendEmail = async (row: SaleRow) => {
    setBusy(row._id);
    try {
      const r = await fetch(`/api/pos/sales/${row._id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailTo }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) toast.error(j?.message ?? "Could not send the email");
      else {
        toast.success(`Sent to ${emailTo}`);
        setEmailFor(null);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Today&apos;s sales</SheetTitle>
          <SheetDescription>
            This branch only. Anything still sending is retried automatically.
          </SheetDescription>
        </SheetHeader>

        {totals && (
          <div className="border-b px-4 py-3">
            <SalesTiles
              rows={totals}
              queued={queued.map((q): QueuedTotal => ({ currency: (q.display as { currency?: string }).currency === "ZWG" ? "ZWG" : "USD", total: Number((q.display as { totalAmount?: number }).totalAmount) || 0 }))}
            />
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
          <span>{rows ? `${rows.length} sale${rows.length === 1 ? "" : "s"}` : "Loading…"}</span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-accent"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden /> Refresh
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
          {queued.length > 0 && (
            <section
              aria-label="Saved on this till"
              className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30"
            >
              <h3 className="text-sm font-medium text-amber-900 dark:text-amber-100">Saved on this till, not sent yet</h3>
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-200">
                {reachable
                  ? "Sending now. They appear in the list below once the server has them."
                  : "They will be sent automatically as soon as the connection is back."}
              </p>
              <ul className="mt-2 divide-y divide-amber-200 dark:divide-amber-900">
                {queued.map((q) => {
                  const d = q.display as unknown as SaleRow & { provisionalNumber?: string };
                  return (
                    <li key={q.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-semibold tabular-nums">{d.provisionalNumber}</span>
                        <span className="ml-2 text-xs text-muted-foreground tabular-nums">{time(String(d.soldAt))}</span>
                        {q.error && <div className="truncate text-xs text-destructive">Rejected: {q.error}</div>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold tabular-nums">
                          {d.currency} {money(d.totalAmount)}
                        </span>
                        <button
                          type="button"
                          aria-label={`Reprint ${d.provisionalNumber}`}
                          onClick={() => void printSlip(d as never, branch.pos.receipt, { duplicate: true })}
                          className="inline-flex size-8 items-center justify-center rounded-md border bg-background transition-transform duration-150 hover:bg-accent active:scale-[0.95]"
                        >
                          <Printer className="size-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {!rows && !reachable && <p className="py-6 text-center text-sm text-muted-foreground">The server cannot be reached right now.</p>}
          {rows && rows.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No sales yet today.</p>}
          <ul className="divide-y">
            {rows?.map((s) => {
              const isCredit = s.kind === "CREDIT_NOTE";
              const st =
                isCredit && s.status === "FISCALISED"
                  ? { label: "Credit note", tone: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" }
                  : STATUS[s.status];
              const canIssueCredit = canCredit && s.status === "FISCALISED" && !isCredit && !s.creditNoteId;
              const canFiscalise = s.status === "UNFISCALISED" || s.status === "UNKNOWN";
              const printable = s.status === "FISCALISED" || canFiscalise;
              return (
                <li key={s._id} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-semibold tabular-nums">{s.invoiceNumber ?? s.provisionalNumber ?? "—"}</span>
                      <span className="ml-2 text-xs text-muted-foreground tabular-nums">{time(s.soldAt)}</span>
                    </div>
                    <div className="shrink-0 text-right font-semibold tabular-nums">
                      {s.currency} {money(s.totalAmount)}
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", st.tone)}>{st.label}</span>
                    {s.status === "FISCALISED" && s.provisionalNumber && !isCredit && (
                      <span className="text-xs text-muted-foreground">was {s.provisionalNumber}</span>
                    )}
                    {isCredit && s.originalNumber && <span className="text-xs text-muted-foreground">for {s.originalNumber}</span>}
                    {!isCredit && s.creditNoteId && <span className="text-xs text-muted-foreground">credited</span>}
                    {s.needsApproval && <span className="text-xs text-amber-700 dark:text-amber-300">Waiting for an administrator</span>}
                    {s.status === "FAILED" && s.lastError && <span className="truncate text-xs text-destructive">{s.lastError}</span>}
                    <span className="ml-auto flex items-center gap-1">
                      {canFiscalise && isAdmin && (
                        <button
                          type="button"
                          disabled={busy === s._id}
                          onClick={() => void fiscalise(s)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-transform duration-150 hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50"
                        >
                          {busy === s._id && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Fiscalise
                        </button>
                      )}
                      {canIssueCredit && (
                        <button
                          type="button"
                          onClick={() => {
                            setCreditFor(creditFor === s._id ? null : s._id);
                            setCreditReason("");
                          }}
                          className="inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-medium transition-transform duration-150 hover:bg-accent active:scale-[0.97]"
                        >
                          Credit note
                        </button>
                      )}
                      {printable && (
                        <>
                          <button
                            type="button"
                            aria-label={`Reprint ${s.invoiceNumber ?? s.provisionalNumber}`}
                            onClick={() => void printSlip(s as never, branch.pos.receipt, { duplicate: true })}
                            className="inline-flex size-8 items-center justify-center rounded-md border transition-transform duration-150 hover:bg-accent active:scale-[0.95]"
                          >
                            <Printer className="size-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Email ${s.invoiceNumber ?? s.provisionalNumber}`}
                            onClick={() => {
                              setEmailFor(emailFor === s._id ? null : s._id);
                              setEmailTo(s.buyer?.email ?? "");
                            }}
                            className="inline-flex size-8 items-center justify-center rounded-md border transition-transform duration-150 hover:bg-accent active:scale-[0.95]"
                          >
                            <Mail className="size-4" />
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                  {creditFor === s._id && (
                    <form
                      className="mt-2 space-y-2 rounded-md border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/20"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void issueCredit(s);
                      }}
                    >
                      <p className="text-sm">
                        This reverses the whole sale of {s.currency} {money(s.totalAmount)} with a fiscal credit note. It can only be done once.
                      </p>
                      <input
                        autoFocus
                        value={creditReason}
                        maxLength={200}
                        onChange={(e) => setCreditReason(e.target.value)}
                        placeholder="Reason (optional, printed on the credit note)"
                        aria-label="Reason for the credit note"
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={busy === s._id}
                          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
                        >
                          {busy === s._id ? "Issuing…" : "Issue credit note"}
                        </button>
                        <button type="button" onClick={() => setCreditFor(null)} className="h-9 rounded-md border px-3 text-sm">
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                  {emailFor === s._id && (
                    <form
                      className="mt-2 flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void sendEmail(s);
                      }}
                    >
                      <input
                        autoFocus
                        type="email"
                        required
                        value={emailTo}
                        onChange={(e) => setEmailTo(e.target.value)}
                        placeholder="customer@example.com"
                        aria-label="Customer email address"
                        className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                      />
                      <button
                        type="submit"
                        disabled={busy === s._id}
                        className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
                      >
                        Send
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
