"use client";

import { FileImage, Loader2, LogOut, Printer, ReceiptText, Smartphone, Trash2, TriangleAlert } from "lucide-react";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import {
  addLine,
  cartTotals,
  priceFromProduct,
  priceFromTyped,
  searchProducts,
  unitPrice,
  type CartLine,
  type Currency,
  type TerminalProduct,
} from "@/components/pos/cart";
import DespatchImportDialog, { type DespatchImport } from "@/components/pos/DespatchImportDialog";
import PhoneScanDialog from "@/components/pos/PhoneScanDialog";
import SalesSheet, { type SaleRow } from "@/components/pos/SalesSheet";
import { useOfflineQueue } from "@/components/pos/useOfflineQueue";
import { clearAll, fallbackNumber, kvGet, kvSet, takeProvisionalNumber } from "@/lib/pos/offlineStore";
import { printSlip } from "@/lib/pos/print";
import { getSelectedTillId, setSelectedTillId } from "@/lib/pos/tillSelection";
import { money } from "@/lib/pos/slip";
import type { DespatchScanDto } from "@/lib/services/despatchScan.service";
import type { PosBranchDto } from "@/lib/services/posBranch.service";
import { cn } from "@/lib/utils";

interface Props {
  branch: PosBranchDto;
  cashierName: string;
  /** USD -> ZWG rate at page load. */
  rate: number;
  isAdmin: boolean;
  /** Supervisors (administrators and branch users) may issue credit notes; cashiers may not. */
  canCredit: boolean;
}

interface SummaryRow {
  currency: Currency;
  fiscalised: { count: number; total: number; vat: number };
  credit?: { count: number; total: number };
  pending: { count: number; total: number };
}
interface Summary {
  totals: SummaryRow[];
  device: { reachable: boolean; dayOpen: boolean | null; fiscalDayNo: number | null };
  unfiscalised: number;
}

type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "OTHER";
const PAYMENTS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "OTHER", label: "Other" },
];

const KEYS: [string, string][] = [
  ["Enter", "add item"],
  ["F12", "issue invoice"],
  ["F2", "currency"],
  ["F3", "product"],
  ["F4", "customer"],
  ["F8", "sales"],
  ["F9", "reprint last"],
  ["Esc Esc", "clear sale"],
];

/** `reachable` is false only when the request itself failed (no answer), not when the server said no. */
async function fetchSummary(branchId: string): Promise<{ reachable: boolean; summary: Summary | null }> {
  try {
    const r = await fetch(`/api/pos/summary?branchId=${branchId}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    return { reachable: true, summary: j.success ? (j.data as Summary) : null };
  } catch {
    return { reachable: false, summary: null }; // the strip keeps its last numbers while offline
  }
}

function formatSpan(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random()}`);
const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");

interface Buyer {
  registerName: string;
  tradeName: string;
  tin: string;
  vatNumber: string;
  email: string;
  phone: string;
  address: string;
  city: string;
}
const EMPTY_BUYER: Buyer = { registerName: "", tradeName: "", tin: "", vatNumber: "", email: "", phone: "", address: "", city: "" };

interface PosCustomerLite {
  _id: string;
  name: string;
  tradeName?: string;
  tin?: string;
  vatNumber?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
}

/** Only fields with a value are sent; an email the server would reject is dropped rather than failing the sale. */
function buyerPayload(b: Buyer) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(b)) {
    const t = v.trim();
    if (t && !(k === "email" && !/^\S+@\S+\.\S+$/.test(t))) out[k] = t;
  }
  return Object.keys(out).length ? out : undefined;
}

function searchCustomers(list: PosCustomerLite[], query: string, limit = 7): PosCustomerLite[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored: { c: PosCustomerLite; s: number }[] = [];
  for (const c of list) {
    const name = c.name.toLowerCase();
    const hay = `${name} ${(c.tradeName ?? "").toLowerCase()} ${(c.tin ?? "").toLowerCase()}`;
    let s = 0;
    if (name === q) s = 90;
    else if (name.startsWith(q)) s = 60;
    else if (words.every((w) => hay.includes(w))) s = 30;
    if (s) scored.push({ c, s });
  }
  return scored.sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name)).slice(0, limit).map((x) => x.c);
}

export default function PosTerminal({ branch, cashierName, rate, isAdmin, canCredit }: Props) {
  const { pos } = branch;
  const taxPercent = pos.taxPercent;
  const taxInclusive = pos.taxInclusive;

  const [currency, setCurrency] = useState<Currency>(pos.defaultCurrency);
  const [products, setProducts] = useState<TerminalProduct[] | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [selected, setSelected] = useState(-1);

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<TerminalProduct | null>(null);
  const [qtyText, setQtyText] = useState("");
  const [priceText, setPriceText] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [entryError, setEntryError] = useState("");

  const [buyer, setBuyer] = useState<Buyer>(EMPTY_BUYER);
  const [customers, setCustomers] = useState<PosCustomerLite[]>([]);
  const [custOpen, setCustOpen] = useState(false);
  const [custHighlight, setCustHighlight] = useState(0);
  const [payment, setPayment] = useState<PaymentMethod>("CASH");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [last, setLast] = useState<SaleRow | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [now, setNow] = useState(0);
  const [salesOpen, setSalesOpen] = useState(false);
  const [phoneScanOpen, setPhoneScanOpen] = useState(false);
  // Slips photographed on a phone and waiting at this till, and the one whose lines are in the cart now.
  const [scans, setScans] = useState<DespatchScanDto[]>([]);
  const [scanImportOpen, setScanImportOpen] = useState(false);
  const [importedScan, setImportedScan] = useState<{ id: string; slipNumber: string | null } | null>(null);
  const announcedScans = useRef<Set<string>>(new Set());
  // Email the A4 tax invoice PDF to the customer once the sale is fiscalised.
  const [emailInvoice, setEmailInvoice] = useState(false);
  const [escArmed, setEscArmed] = useState(false);
  // The branch's tills (cash desks) and which one this browser is. Empty list = the branch uses no tills.
  const [tills, setTills] = useState<{ id: string; code: string; name: string }[]>([]);
  const [tillId, setTillId] = useState<string | null>(null);

  const productRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const escTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A ref, not state: the second Esc can arrive before React has re-registered the key handler.
  const escArmedRef = useRef(false);

  const totals = useMemo(
    () => cartTotals(lines, currency, rate, taxPercent, taxInclusive),
    [lines, currency, rate, taxPercent, taxInclusive]
  );
  const results = useMemo(() => (products ? searchProducts(products, query) : []), [products, query]);

  // ---- data ---------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cacheKey = `tills:${branch.id}`;
      let list: { id: string; code: string; name: string }[] | null = null;
      try {
        const r = await fetch(`/api/pos/branches/${branch.id}/tills`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
        const j = await r.json().catch(() => null);
        if (r.ok && j?.success) {
          list = j.data;
          await kvSet(cacheKey, list);
        }
      } catch {
        /* offline: use the list saved last time */
      }
      if (!list) list = (await kvGet<{ id: string; code: string; name: string }[]>(cacheKey)) ?? [];
      if (cancelled) return;
      setTills(list);
      const saved = getSelectedTillId(branch.id);
      if (saved && list.some((t) => t.id === saved)) setTillId(saved);
      else if (list.length === 1) {
        setSelectedTillId(branch.id, list[0].id);
        setTillId(list[0].id);
      } else setTillId(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [branch.id]);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `products:${branch.id}`;
    (async () => {
      try {
        const r = await fetch(`/api/pos/products?branchId=${branch.id}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        const j = await r.json();
        if (!j.success) throw new Error("products");
        if (!cancelled) setProducts(j.data);
        void kvSet(cacheKey, j.data); // lets the till keep selling if the connection drops
      } catch {
        const cached = await kvGet<TerminalProduct[]>(cacheKey);
        if (!cancelled) setProducts(cached ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branch.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/pos/customers", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        const j = await r.json();
        if (!j.success) throw new Error("customers");
        if (!cancelled) setCustomers(j.data);
        void kvSet("customers", j.data);
      } catch {
        const cached = await kvGet<PosCustomerLite[]>("customers");
        if (!cancelled) setCustomers(cached ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const custMatches = useMemo(() => searchCustomers(customers, buyer.registerName), [customers, buyer.registerName]);

  const pickCustomer = useCallback((c: PosCustomerLite) => {
    setBuyer({
      registerName: c.name,
      tradeName: c.tradeName ?? "",
      tin: c.tin ?? "",
      vatNumber: c.vatNumber ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
    });
    setCustOpen(false);
    productRef.current?.focus();
  }, []);

  const markReachableRef = useRef<(ok: boolean) => Promise<void>>(async () => {});

  const refreshSummary = useCallback(async () => {
    const { reachable, summary: s } = await fetchSummary(branch.id);
    void markReachableRef.current(reachable);
    if (s) setSummary(s);
  }, [branch.id]);

  const off = useOfflineQueue({
    branchId: branch.id,
    onSynced: (n) => {
      void refreshSummary();
      toast.success(`${n} offline sale${n === 1 ? "" : "s"} synced`);
    },
  });
  useEffect(() => {
    markReachableRef.current = off.markReachable;
  }, [off.markReachable]);

  useEffect(() => {
    let ignore = false;
    const tick = async () => {
      const { reachable, summary: s } = await fetchSummary(branch.id);
      if (ignore) return;
      void markReachableRef.current(reachable);
      if (s) setSummary(s);
    };
    void tick();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void tick();
    }, 15_000);
    return () => {
      ignore = true;
      clearInterval(t);
    };
  }, [branch.id]);

  // The slip inbox: scans from paired phones appear here a few seconds after the photo is taken.
  const loadScans = useCallback(async () => {
    try {
      const q = new URLSearchParams({ branchId: branch.id, status: "processing,ready,failed" });
      if (tillId) q.set("tillId", tillId);
      const r = await fetch(`/api/pos/despatch-scans?${q}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.success) setScans(j.data as DespatchScanDto[]);
    } catch {
      /* offline or slow: keep what is on screen */
    }
  }, [branch.id, tillId]);

  useEffect(() => {
    const first = setTimeout(() => void loadScans(), 0);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void loadScans();
    }, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadScans]);

  // Tell the cashier once when a slip is ready, without taking over the screen mid-sale.
  useEffect(() => {
    for (const s of scans) {
      if (s.status !== "ready" || announcedScans.current.has(s.id)) continue;
      announcedScans.current.add(s.id);
      toast.info(s.slipNumber ? `Slip ${s.slipNumber} is ready` : "A slip is ready", {
        action: { label: "Review", onClick: () => setScanImportOpen(true) },
      });
    }
  }, [scans]);

  // A slow clock for the "offline for N minutes" text.
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  // The box is disabled until the catalog arrives, so focus it again at that moment.
  useEffect(() => {
    if (products) productRef.current?.focus();
  }, [products]);

  // ---- entry flow ---------------------------------------------------------

  const resetEntry = useCallback(() => {
    // Apply the cleared fields before focusing: focusing first makes the product box see its old
    // text in onFocus and quietly re-open the dropdown state.
    flushSync(() => {
      setQuery("");
      setPicked(null);
      setQtyText("");
      setPriceText("");
      setOpen(false);
      setHighlight(0);
      setEntryError("");
    });
    productRef.current?.focus();
  }, []);

  const catalogPriceText = useCallback(
    (p: TerminalProduct, ccy: Currency) =>
      p.priceOnEntry ? "" : unitPrice({ ...priceFromProduct(p), key: "", description: "", quantity: 1 }, ccy, rate).toFixed(2),
    [rate]
  );

  const choose = useCallback(
    (p: TerminalProduct) => {
      // Commit the new field values before moving focus, so the very next keystroke
      // (a fast typist, or a scanner) replaces the pre-filled quantity instead of appending to it.
      flushSync(() => {
        setPicked(p);
        setQuery(p.name);
        setQtyText("1");
        setPriceText(catalogPriceText(p, currency));
        setOpen(false);
        setEntryError("");
      });
      const el = p.priceOnEntry ? priceRef.current : qtyRef.current;
      el?.focus();
      el?.select();
    },
    [catalogPriceText, currency]
  );

  const commit = useCallback(() => {
    const name = (picked?.name ?? query).trim();
    if (!name) {
      setEntryError("Type a product name or scan a code");
      productRef.current?.focus();
      return;
    }
    const qty = Number(qtyText || "1");
    if (!(qty > 0) || qty > 100_000 || Math.round(qty * 1000) / 1000 !== qty) {
      setEntryError("Quantity must be a positive number (up to 3 decimals)");
      qtyRef.current?.focus();
      return;
    }
    const typed = Number(priceText);
    if (!(typed > 0)) {
      setEntryError(picked ? "This item needs a price" : "Enter a price for this item");
      priceRef.current?.focus();
      return;
    }

    let prices: Pick<CartLine, "usd" | "zwg">;
    if (picked && !picked.priceOnEntry && Math.abs(typed - Number(catalogPriceText(picked, currency))) < 0.005) {
      prices = priceFromProduct(picked); // untouched catalog price keeps both currencies exact
    } else {
      prices = priceFromTyped(typed, currency, rate);
    }

    setLines((prev) => {
      const next = addLine(prev, {
        key: newKey(),
        productId: picked?.id,
        description: name,
        hsCode: picked?.hsCode || undefined,
        quantity: qty,
        ...prices,
      });
      setSelected(next.length - 1);
      return next;
    });
    setLast(null);
    setSubmitError("");
    resetEntry();
  }, [picked, query, qtyText, priceText, currency, rate, catalogPriceText, resetEntry]);

  const onProductKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (query.trim() === "" && lines.length) {
        setSelected((s) => Math.min(lines.length - 1, Math.max(0, s + (e.key === "ArrowDown" ? 1 : -1))));
      } else if (results.length) {
        setOpen(true);
        setHighlight((h) => (h + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (picked) return qtyRef.current?.focus();
      if (results.length && open !== false) return choose(results[Math.min(highlight, results.length - 1)]);
      if (results.length) return choose(results[0]);
      if (query.trim()) {
        // Not in the catalog: sell it as a typed item (name, then price, then quantity).
        setQtyText("1");
        priceRef.current?.focus();
      }
    } else if (e.key === "Delete" && query === "" && selected >= 0 && lines[selected]) {
      e.preventDefault();
      removeAt(selected);
    } else if (e.key === "Tab" && results.length && !picked && query.trim()) {
      e.preventDefault();
      choose(results[Math.min(highlight, results.length - 1)]);
    }
  };

  const removeAt = (i: number) => {
    if (lines.length <= 1) setImportedScan(null);
    setLines((prev) => prev.filter((_, idx) => idx !== i));
    setSelected((s) => Math.max(-1, Math.min(s, lines.length - 2)));
  };

  // ---- slip import --------------------------------------------------------

  const importScan = useCallback(
    ({ scan, lines: incoming }: DespatchImport) => {
      setLines((prev) => incoming.reduce((acc, l) => addLine(acc, l), prev));
      setImportedScan({ id: scan.id, slipNumber: scan.slipNumber });
      setEmailInvoice(true);
      attempt.current = null;
      // Fill the customer from the slip, but never over one the cashier already entered.
      setBuyer((cur) => {
        if (cur.registerName || cur.tin || cur.email) return cur;
        const tin = scan.customerTin?.trim().toLowerCase();
        const saved = tin ? customers.find((c) => c.tin && c.tin.trim().toLowerCase() === tin) : undefined;
        if (saved) {
          return {
            registerName: saved.name,
            tradeName: saved.tradeName ?? "",
            tin: saved.tin ?? "",
            vatNumber: saved.vatNumber ?? "",
            email: saved.email ?? scan.customerEmail ?? "",
            phone: saved.phone ?? "",
            address: saved.address ?? "",
            city: saved.city ?? "",
          };
        }
        return { ...EMPTY_BUYER, registerName: scan.customerName ?? "", tin: scan.customerTin ?? "", email: scan.customerEmail ?? "" };
      });
      toast.success(`${incoming.length} line${incoming.length === 1 ? "" : "s"} added from the slip. Check the customer, then issue the invoice.`);
      requestAnimationFrame(() => productRef.current?.focus());
    },
    [customers]
  );

  // ---- currency -----------------------------------------------------------

  const switchCurrency = useCallback(
    (next: Currency) => {
      if (next === currency) return;
      setCurrency(next);
      if (picked && !picked.priceOnEntry) setPriceText(catalogPriceText(picked, next));
      attempt.current = null;
    },
    [currency, picked, catalogPriceText]
  );

  // ---- sale ---------------------------------------------------------------

  const slipBranch = pos.receipt;

  const doPrint = useCallback(
    async (row: SaleRow, duplicate = false) => {
      try {
        await printSlip(row as never, slipBranch, { duplicate });
      } catch {
        toast.error("Could not open the printer. Use Reprint (F9).");
      } finally {
        // Printing moves focus into the hidden slip frame; hand it back to the till.
        productRef.current?.focus();
      }
    },
    [slipBranch]
  );

  const afterSale = useCallback(
    (row: SaleRow, opts: { print?: boolean } = {}) => {
      attempt.current = null;
      setImportedScan(null);
      setEmailInvoice(false);
      setLines([]);
      setSelected(-1);
      setBuyer(EMPTY_BUYER);
      setPayment("CASH");
      setLast(row);
      if (opts.print !== false) void doPrint(row);
      resetEntry();
    },
    [doPrint, resetEntry]
  );

  /** No answer from the server: keep the sale on this device, hand over a numbered provisional slip. */
  const sellOffline = useCallback(
    async (body: Record<string, unknown>, key: string, totals: ReturnType<typeof cartTotals>) => {
      const limit = pos.offlineLimitHours;
      const since = (await kvGet<number>(`offlineSince:${branch.id}`)) ?? Date.now();
      if (limit !== null && limit !== undefined && Date.now() - since > limit * 3_600_000) {
        setSubmitError(`This till has been offline for more than ${limit} hours. Reconnect to keep selling.`);
        return;
      }
      if (!off.storageOk) {
        setSubmitError("This browser cannot store offline sales. Reconnect to the server to keep selling.");
        return;
      }
      const number =
        (await takeProvisionalNumber(branch.id, currency)) ?? (await fallbackNumber(pos.invoicePrefix ?? "", currency));
      const display = {
        _id: key,
        status: "UNFISCALISED",
        currency,
        paymentMethod: payment,
        provisionalNumber: number,
        totalAmount: totals.total,
        totalVat: totals.vat,
        subtotalExclTax: totals.subtotalExcl,
        lines: lines.map((l, i) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: totals.lines[i].unitPrice,
          taxPercent,
          vatAmount: totals.lines[i].vat,
          lineTotalExcl: totals.lines[i].lineTotalExcl,
          lineTotalIncl: totals.lines[i].lineTotalIncl,
        })),
        buyer: body.buyer,
        soldAt: body.soldAt,
        offlinePending: true,
      } as unknown as SaleRow;
      await off.enqueue({
        id: key,
        branchId: branch.id,
        payload: { ...body, provisionalNumber: number, offline: true },
        display: display as unknown as Record<string, unknown>,
        createdAt: Date.now(),
        attempts: 0,
      });
      afterSale(display);
      toast.warning("Saved on this till", {
        description: "No connection to the server. A provisional receipt was printed; the sale will be sent automatically.",
      });
    },
    [pos.offlineLimitHours, pos.invoicePrefix, branch.id, currency, payment, lines, taxPercent, off, afterSale]
  );

  const fiscalise = useCallback(async () => {
    if (submitting) return;
    if (lines.length === 0) {
      setEntryError("Add at least one item before issuing the invoice");
      productRef.current?.focus();
      return;
    }
    if (tills.length > 0 && !tillId) {
      setSubmitError("Choose which till this is (top of the screen) before selling.");
      return;
    }
    const emailTo = emailInvoice && /^\S+@\S+\.\S+$/.test(buyer.email.trim()) ? buyer.email.trim() : null;
    if (emailTo && !buyer.registerName.trim()) {
      setSubmitError("Enter the customer's name: it is required on an emailed tax invoice.");
      return;
    }
    setSubmitError("");
    setSubmitting(true);

    const payload = {
      branchId: branch.id,
      ...(tillId ? { tillId } : {}),
      currency,
      paymentMethod: payment,
      lines: lines.map((l) => ({
        productId: l.productId,
        description: l.description,
        hsCode: l.hsCode,
        quantity: l.quantity,
        unitPrice: unitPrice(l, currency, rate),
      })),
      buyer: buyerPayload(buyer),
      ...(importedScan ? { source: { scanId: importedScan.id } } : {}),
      ...(emailTo ? { emailInvoice: true } : {}),
      soldAt: new Date().toISOString(),
    };
    // Same sale content = same key, so a retry after a lost reply can never create a second sale.
    const sig = JSON.stringify({ ...payload, soldAt: undefined });
    if (!attempt.current || attempt.current.body !== sig) attempt.current = { body: sig, key: newKey() + newKey() };
    const key = attempt.current.key;
    const body = payload;
    const totalsNow = cartTotals(lines, currency, rate, taxPercent, taxInclusive);

    try {
      if (!navigator.onLine) {
        await off.markReachable(false);
        await sellOffline(body, key, totalsNow);
        return;
      }
      let r: Response;
      try {
        r = await fetch("/api/pos/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, idempotencyKey: key }),
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        // No answer. If the request did land, the same key makes the later sync return that sale.
        await off.markReachable(false);
        await sellOffline(body, key, totalsNow);
        return;
      }
      await off.markReachable(true);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) {
        setSubmitError(j?.message ?? `Sale was not saved (HTTP ${r.status}). Your items are still here, press F12 to try again.`);
        return;
      }
      const sale = j.data as SaleRow;
      if (sale.status === "FAILED") {
        setSubmitError(sale.lastError ?? "This sale could not be issued. Check the items and try again.");
        attempt.current = null;
        return;
      }
      // A sale built from a photographed slip goes to the customer by email, not on the thermal printer.
      afterSale(sale, { print: !(emailTo && importedScan) });
      if (emailTo) toast.info(`Tax invoice will be emailed to ${emailTo}`, { description: "It is sent automatically once the invoice is final." });
      void refreshSummary();
      if (sale.status !== "FISCALISED") {
        toast.info("Invoice saved", {
          description: "The final tax invoice is sent automatically. Nothing more to do.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }, [submitting, lines, importedScan, emailInvoice, tills.length, tillId, branch.id, currency, payment, rate, buyer, refreshSummary, taxPercent, taxInclusive, off, sellOffline, afterSale]);

  const clearSale = useCallback(() => {
    setImportedScan(null);
    setEmailInvoice(false);
    setLines([]);
    setSelected(-1);
    setBuyer(EMPTY_BUYER);
    setSubmitError("");
    attempt.current = null;
    resetEntry();
  }, [resetEntry]);

  // ---- global keys --------------------------------------------------------

  const onGlobalKey = useCallback(
    (e: KeyboardEvent) => {
      if (salesOpen || phoneScanOpen || scanImportOpen) return;
      const fn = ["F2", "F3", "F4", "F8", "F9", "F12"];
      if (fn.includes(e.key)) {
        e.preventDefault();
        if (e.key === "F12") void fiscalise();
        if (e.key === "F2") switchCurrency(currency === "USD" ? "ZWG" : "USD");
        if (e.key === "F3") productRef.current?.focus();
        if (e.key === "F4") customerRef.current?.focus();
        if (e.key === "F8") setSalesOpen(true);
        if (e.key === "F9" && last) void doPrint(last, true);
        return;
      }
      if (e.key === "Escape") {
        if (open && results.length > 0) return setOpen(false);
        if (picked || query) return resetEntry();
        if (!lines.length) return;
        if (escArmedRef.current) {
          if (escTimer.current) clearTimeout(escTimer.current);
          escArmedRef.current = false;
          setEscArmed(false);
          clearSale();
        } else {
          escArmedRef.current = true;
          setEscArmed(true);
          escTimer.current = setTimeout(() => {
            escArmedRef.current = false;
            setEscArmed(false);
          }, 1800);
        }
      } else if (!isTyping(e.target) && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        productRef.current?.focus(); // typing anywhere starts a product search
      }
    },
    [salesOpen, phoneScanOpen, scanImportOpen, fiscalise, switchCurrency, currency, last, doPrint, open, picked, query, resetEntry, lines.length, clearSale, results.length]
  );

  useEffect(() => {
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, [onGlobalKey]);

  // ---- render -------------------------------------------------------------

  const usd = summary?.totals.find((t) => t.currency === "USD");
  const zwg = summary?.totals.find((t) => t.currency === "ZWG");
  const device = summary?.device;
  const dayOpen = device?.reachable && device.dayOpen;
  const needsPrice = picked?.priceOnEntry || (!picked && query.trim() !== "" && results.length === 0);

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr_auto] bg-muted/40 text-foreground">
      {/* Status bar */}
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b bg-background px-4 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight">{branch.pos.receipt.branchName || branch.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {cashierName}
            {isAdmin ? " · administrator" : ""}
          </div>
        </div>

        {tills.length > 0 && (
          <label className="inline-flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Till</span>
            <select
              value={tillId ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                setTillId(v);
                setSelectedTillId(branch.id, v);
                setSubmitError("");
              }}
              className={cn(
                "h-8 rounded-md border bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                !tillId && "border-amber-400"
              )}
              aria-label="Which till is this"
            >
              <option value="">Choose…</option>
              {tills.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Device and fiscal-day health is an administrator's concern; cashiers just issue invoices. */}
        {isAdmin && (
          <div
            className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
            role="status"
            aria-live="polite"
          >
            <span
              className={cn(
                "size-2 rounded-full",
                !summary ? "bg-muted-foreground/40" : dayOpen ? "bg-emerald-500" : device?.reachable ? "bg-amber-500" : "bg-red-500"
              )}
              aria-hidden
            />
            {!summary
              ? "Checking fiscal device…"
              : !device?.reachable
                ? "Fiscal device unreachable. Receipts will be provisional."
                : dayOpen
                  ? `Fiscal day ${device.fiscalDayNo ?? ""} open`
                  : "Fiscal day closed. Receipts will be provisional."}
          </div>
        )}

        {!off.reachable && (
          <div
            role="status"
            className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            <TriangleAlert className="size-3.5" aria-hidden />
            Server unreachable: selling offline
            {off.offlineSince && now > 0 ? ` for ${formatSpan(now - off.offlineSince)}` : ""}
            {pos.offlineLimitHours != null ? ` (limit ${pos.offlineLimitHours} h)` : ""}
          </div>
        )}
        {off.authExpired && off.queue.length > 0 && (
          <div
            role="alert"
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <TriangleAlert className="size-3.5" aria-hidden /> Session expired. Sign in again to send {off.queue.length} saved sale
            {off.queue.length === 1 ? "" : "s"}.
          </div>
        )}

        <button
          type="button"
          onClick={() => setPhoneScanOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-transform duration-150 hover:bg-accent active:scale-[0.97]"
        >
          <Smartphone className="size-3.5" aria-hidden />
          Scan slip with phone
        </button>

        {scans.length > 0 && (
          <button
            type="button"
            onClick={() => setScanImportOpen(true)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-transform duration-150 hover:bg-accent active:scale-[0.97]",
              scans.some((s) => s.status === "ready") && "border-primary bg-primary/10 font-medium"
            )}
          >
            <FileImage className="size-3.5" aria-hidden />
            {scans.some((s) => s.status === "ready")
              ? `${scans.filter((s) => s.status === "ready").length} slip${scans.filter((s) => s.status === "ready").length === 1 ? "" : "s"} ready`
              : scans.some((s) => s.status === "processing")
                ? "Reading slip…"
                : "Slip could not be read"}
          </button>
        )}

        <button
          type="button"
          onClick={() => setSalesOpen(true)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-transform duration-150 hover:bg-accent active:scale-[0.97]",
            ((isAdmin && summary && summary.unfiscalised > 0) || off.queue.length > 0) && "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          )}
        >
          <ReceiptText className="size-3.5" aria-hidden />
          {off.queue.length > 0
            ? `${off.queue.length} saved on this till`
            : isAdmin && summary && summary.unfiscalised > 0
              ? `${summary.unfiscalised} awaiting fiscalisation`
              : "Today's sales"}
          <kbd className="rounded border bg-background px-1 font-sans text-[10px] text-muted-foreground">F8</kbd>
        </button>

        <div className="flex items-center gap-2">
          <div role="group" aria-label="Currency" className="inline-flex rounded-lg border bg-muted p-0.5">
            {(["USD", "ZWG"] as Currency[]).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={currency === c}
                onClick={() => switchCurrency(c)}
                className={cn(
                  "h-9 min-w-16 rounded-md px-3 text-sm font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.97]",
                  currency === c ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <kbd className="hidden rounded border bg-background px-1 font-sans text-[10px] text-muted-foreground sm:block">F2</kbd>
        </div>
        <div className="hidden text-xs text-muted-foreground tabular-nums xl:block">1 USD = {rate.toFixed(2)} ZWG</div>
        <button
          type="button"
          onClick={async () => {
            if (off.queue.length > 0) {
              toast.error(`${off.queue.length} sale${off.queue.length === 1 ? " is" : "s are"} saved on this till and not sent yet`, {
                description: "Reconnect so they can be sent before signing out.",
              });
              return;
            }
            await clearAll();
            try {
              await caches.delete("pos-shell-v1");
            } catch {
              /* no cache API */
            }
            void signOut({ callbackUrl: "/sign-in" });
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.97]"
        >
          <LogOut className="size-3.5" aria-hidden /> Sign out
        </button>
      </header>

      <main className="grid min-h-0 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
        {/* Left: entry + items */}
        <section className="flex min-h-0 flex-col gap-3">
          <div className="rounded-xl border bg-background p-3 shadow-xs">
            <div className="grid grid-cols-[minmax(0,1fr)_6rem_8.5rem] gap-3">
              <div className="relative">
                <label htmlFor="pos-product" className="mb-1 block text-xs font-medium text-muted-foreground">
                  Product or code
                </label>
                <input
                  id="pos-product"
                  ref={productRef}
                  value={query}
                  autoComplete="off"
                  spellCheck={false}
                  role="combobox"
                  aria-expanded={open && results.length > 0}
                  aria-controls="pos-results"
                  aria-activedescendant={open && results.length ? `pos-opt-${highlight}` : undefined}
                  placeholder={products === null ? "Loading products…" : "Type a name, or scan a barcode"}
                  disabled={products === null}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPicked(null);
                    setOpen(true);
                    setHighlight(0);
                    setEntryError("");
                  }}
                  onFocus={() => query && setOpen(true)}
                  onBlur={() => setTimeout(() => setOpen(false), 120)}
                  onKeyDown={onProductKey}
                  className="h-12 w-full rounded-lg border bg-background px-3 text-base outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                />
                {open && results.length > 0 && (
                  <ul
                    id="pos-results"
                    role="listbox"
                    className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg border bg-popover p-1 shadow-lg"
                  >
                    {results.map((p, i) => (
                      <li
                        key={p.id}
                        id={`pos-opt-${i}`}
                        role="option"
                        aria-selected={i === highlight}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          choose(p);
                        }}
                        onMouseEnter={() => setHighlight(i)}
                        className={cn(
                          "flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-2.5 py-2 text-sm",
                          i === highlight && "bg-accent"
                        )}
                      >
                        <span className="min-w-0 truncate">
                          {p.name}
                          {p.code && <span className="ml-2 text-xs text-muted-foreground">{p.code}</span>}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {p.priceOnEntry ? "enter price" : money(unitPrice({ ...priceFromProduct(p), key: "", description: "", quantity: 1 }, currency, rate))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label htmlFor="pos-qty" className="mb-1 block text-xs font-medium text-muted-foreground">
                  Qty
                </label>
                <input
                  id="pos-qty"
                  ref={qtyRef}
                  value={qtyText}
                  inputMode="decimal"
                  onChange={(e) => setQtyText(e.target.value.replace(/[^0-9.]/g, ""))}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commit();
                    }
                  }}
                  className="h-12 w-full rounded-lg border bg-background px-3 text-right text-base tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                />
              </div>

              <div>
                <label htmlFor="pos-price" className="mb-1 block text-xs font-medium text-muted-foreground">
                  Price ({currency})
                </label>
                <input
                  id="pos-price"
                  ref={priceRef}
                  value={priceText}
                  inputMode="decimal"
                  placeholder={needsPrice ? "required" : ""}
                  onChange={(e) => setPriceText(e.target.value.replace(/[^0-9.]/g, ""))}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      qtyRef.current?.focus();
                    }
                  }}
                  className={cn(
                    "h-12 w-full rounded-lg border bg-background px-3 text-right text-base tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    needsPrice && "border-amber-400"
                  )}
                />
              </div>
            </div>
            <div className="mt-2 min-h-5 text-sm" role="alert" aria-live="assertive">
              {entryError ? (
                <span className="text-destructive">{entryError}</span>
              ) : needsPrice ? (
                <span className="text-muted-foreground">
                  {picked ? "This item is priced at the till." : "Not in the catalog. Enter a price to sell it as a typed item."}
                </span>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-xl border bg-background shadow-xs">
            {lines.length === 0 ? (
              <EmptyCart last={last} onReprint={() => last && void doPrint(last, true)} />
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="w-10 px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Description</th>
                    <th className="w-20 px-3 py-2 text-right font-medium">Qty</th>
                    <th className="w-28 px-3 py-2 text-right font-medium">Price</th>
                    <th className="w-28 px-3 py-2 text-right font-medium">Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const t = totals.lines[i];
                    return (
                      <tr
                        key={l.key}
                        onClick={() => setSelected(i)}
                        className={cn("group border-b last:border-0", i === selected && "bg-accent")}
                      >
                        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2.5 font-medium">{l.description}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{l.quantity}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{money(t?.unitPrice ?? 0)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{money(t?.lineTotal ?? 0)}</td>
                        <td className="pr-2 text-right">
                          <button
                            type="button"
                            aria-label={`Remove ${l.description}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAt(i);
                              productRef.current?.focus();
                            }}
                            className="rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Right: total, customer, fiscalise, today */}
        <aside className="flex min-h-0 flex-col gap-2.5 overflow-auto">
          <div className="rounded-xl border bg-background p-4 shadow-xs">
            <div className="flex items-baseline justify-between text-sm text-muted-foreground">
              <span>
                {totals.lines.length} {totals.lines.length === 1 ? "item" : "items"}
              </span>
              <span className="tabular-nums">
                VAT {taxPercent}% {money(totals.vat)}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">{currency}</span>
              <span className="text-5xl font-semibold tracking-tight tabular-nums" aria-live="polite">
                {money(totals.total)}
              </span>
            </div>
            <div className="mt-1 text-right text-xs text-muted-foreground tabular-nums">Excl. VAT {money(totals.subtotalExcl)}</div>

            <div className="mt-3 grid grid-cols-4 gap-1.5" role="group" aria-label="Payment method">
              {PAYMENTS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={payment === p.value}
                  onClick={() => setPayment(p.value)}
                  className={cn(
                    "h-9 rounded-md border text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97]",
                    payment === p.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void fiscalise()}
              disabled={submitting || lines.length === 0}
              className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-primary text-base font-semibold text-primary-foreground shadow-xs transition-[background-color,transform,opacity] duration-150 hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-5 animate-spin" aria-hidden /> Issuing…
                </>
              ) : (
                <>
                  Issue invoice &amp; print
                  <kbd className="rounded border border-primary-foreground/30 px-1.5 font-sans text-xs font-medium opacity-80">F12</kbd>
                </>
              )}
            </button>

            <div className="mt-1.5 text-sm empty:hidden" role="alert" aria-live="assertive">
              {submitError && <span className="text-destructive">{submitError}</span>}
              {!submitError && importedScan && lines.length > 0 && (
                <span className="text-muted-foreground">From slip{importedScan.slipNumber ? ` ${importedScan.slipNumber}` : ""}</span>
              )}
              {!submitError && escArmed && <span className="text-muted-foreground">Press Esc again to clear this sale</span>}
            </div>
          </div>

          <div className="rounded-xl border bg-background p-3 shadow-xs">
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Customer</h2>
              <kbd className="rounded border px-1 font-sans text-[10px] text-muted-foreground">F4</kbd>
            </div>
            <div className="space-y-1.5">
              <div className="relative">
                <input
                  ref={customerRef}
                  value={buyer.registerName}
                  onChange={(e) => {
                    // Typing a different name means the saved details no longer apply.
                    setBuyer({ ...EMPTY_BUYER, registerName: e.target.value, tin: buyer.tin, email: buyer.email });
                    setCustOpen(true);
                    setCustHighlight(0);
                  }}
                  onFocus={() => setCustOpen(true)}
                  onBlur={() => setTimeout(() => setCustOpen(false), 120)}
                  onKeyDown={(e) => {
                    const list = custOpen ? custMatches : [];
                    if (e.key === "ArrowDown" && list.length) (e.preventDefault(), setCustHighlight((h) => Math.min(h + 1, list.length - 1)));
                    else if (e.key === "ArrowUp" && list.length) (e.preventDefault(), setCustHighlight((h) => Math.max(h - 1, 0)));
                    else if (e.key === "Escape" && list.length) (e.preventDefault(), e.stopPropagation(), setCustOpen(false));
                    else if (e.key === "Enter") {
                      e.preventDefault();
                      if (list.length) pickCustomer(list[Math.min(custHighlight, list.length - 1)]);
                      else productRef.current?.focus();
                    }
                  }}
                  placeholder="Cash sale (type a customer name)"
                  aria-label="Customer name"
                  role="combobox"
                  aria-expanded={custOpen && custMatches.length > 0}
                  aria-autocomplete="list"
                  autoComplete="off"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                />
                {custOpen && custMatches.length > 0 && (
                  <ul role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-md border bg-popover p-1 shadow-md">
                    {custMatches.map((c, i) => (
                      <li
                        key={c._id}
                        role="option"
                        aria-selected={i === custHighlight}
                        onMouseDown={(e) => (e.preventDefault(), pickCustomer(c))}
                        onMouseEnter={() => setCustHighlight(i)}
                        className={cn("cursor-pointer rounded px-2 py-1.5 text-sm", i === custHighlight && "bg-accent")}
                      >
                        <div className="font-medium">{c.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{[c.tin && `TIN ${c.tin}`, c.email].filter(Boolean).join(" · ") || "No details saved"}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  value={buyer.tin}
                  onChange={(e) => setBuyer((b) => ({ ...b, tin: e.target.value }))}
                  placeholder="TIN"
                  aria-label="Customer TIN"
                  className="h-9 rounded-md border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                />
                <input
                  value={buyer.email}
                  type="email"
                  onChange={(e) => setBuyer((b) => ({ ...b, email: e.target.value }))}
                  placeholder="Email"
                  aria-label="Customer email"
                  className="h-9 rounded-md border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                />
              </div>
              {/^\S+@\S+\.\S+$/.test(buyer.email.trim()) && (
                <label className="mt-2 flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={emailInvoice}
                    onChange={(e) => setEmailInvoice(e.target.checked)}
                    className="mt-0.5 size-3.5"
                  />
                  <span>
                    Email the A4 tax invoice (PDF) to this customer
                    <span className="block text-muted-foreground">Sent automatically once the invoice is final. Needs the customer name.</span>
                  </span>
                </label>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-background p-3 shadow-xs">
            <h2 className="mb-1 text-sm font-semibold">Today at this branch</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="pb-1 text-left font-medium" />
                  <th className="pb-1 text-right font-medium">Invoices</th>
                  <th className="pb-1 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {(
                  [
                    ["USD", usd],
                    ["ZWG", zwg],
                  ] as const
                ).map(([c, row]) => (
                  <tr key={c} className="border-t">
                    <td className="py-1 font-medium">{c}</td>
                    <td className="py-1 text-right">{row ? row.fiscalised.count : "–"}</td>
                    <td className="py-1 text-right font-semibold">{row ? money(row.fiscalised.total) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {([usd, zwg] as const).some((r) => r && r.credit && r.credit.count > 0) && (
              <p className="mt-2 text-xs text-muted-foreground">
                Credit notes today:{" "}
                {([usd, zwg] as const)
                  .filter((r) => r && r.credit && r.credit.count > 0)
                  .map((r) => `${r!.currency} ${money(r!.credit!.total)}`)
                  .join(" · ")}
              </p>
            )}
            {isAdmin && summary && summary.unfiscalised > 0 && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                {summary.unfiscalised} sale{summary.unfiscalised === 1 ? "" : "s"} issued a provisional receipt and not yet fiscalised.
              </p>
            )}
          </div>
        </aside>
      </main>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-background px-4 py-2 text-xs text-muted-foreground">
        {KEYS.map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-foreground">{k}</kbd>
            {label}
          </span>
        ))}
      </footer>

      <DespatchImportDialog
        open={scanImportOpen}
        onClose={() => {
          setScanImportOpen(false);
          requestAnimationFrame(() => productRef.current?.focus());
        }}
        scans={scans}
        products={products}
        currency={currency}
        rate={rate}
        taxPercent={taxPercent}
        taxInclusive={taxInclusive}
        onSwitchCurrency={switchCurrency}
        onImport={importScan}
        onChanged={() => void loadScans()}
      />

      {phoneScanOpen && (
        <PhoneScanDialog
          open
          onClose={() => {
            setPhoneScanOpen(false);
            requestAnimationFrame(() => productRef.current?.focus());
          }}
          branchId={branch.id}
          tillId={tillId}
        />
      )}

      <SalesSheet
        open={salesOpen}
        onOpenChange={(v) => {
          setSalesOpen(v);
          if (!v) requestAnimationFrame(() => productRef.current?.focus());
        }}
        branch={branch}
        onChanged={refreshSummary}
        queued={off.queue}
        reachable={off.reachable}
        canCredit={canCredit}
        isAdmin={isAdmin}
      />
    </div>
  );
}

function EmptyCart({ last, onReprint }: { last: SaleRow | null; onReprint: () => void }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      {last ? (
        <div className="max-w-sm">
          <p className="text-sm text-muted-foreground">
            {last.status === "FISCALISED" ? "Invoice issued" : "Invoice saved. The final copy follows automatically"}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{last.invoiceNumber ?? last.provisionalNumber}</p>
          <p className="mt-1 tabular-nums text-muted-foreground">
            {last.currency} {money(last.totalAmount)}
          </p>
          <button
            type="button"
            onClick={onReprint}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-transform duration-150 hover:bg-accent active:scale-[0.97]"
          >
            <Printer className="size-4" aria-hidden /> Reprint <kbd className="rounded border px-1 font-sans text-[10px] text-muted-foreground">F9</kbd>
          </button>
        </div>
      ) : (
        <div className="max-w-sm text-sm text-muted-foreground">
          <p className="text-base font-medium text-foreground">Ready for the next customer</p>
          <ol className="mt-3 space-y-1 text-left">
            <li>1. Type a product name or scan its code, then Enter.</li>
            <li>2. Check the quantity, then Enter to add it.</li>
            <li>
              3. Press <kbd className="rounded border bg-muted px-1 font-sans text-xs text-foreground">F12</kbd> to issue the invoice and print.
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
