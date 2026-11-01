"use client";

import { Check, Loader2, Search, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  cartTotals,
  priceFromProduct,
  priceFromTyped,
  searchProducts,
  unitPrice,
  type CartLine,
  type Currency,
  type TerminalProduct,
} from "@/components/pos/cart";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { compareWithSlipTotal, parsePrice, parseQuantity, slipPriceToTillPrice, type PriceBasis } from "@/lib/pos/despatchImport";
import { DESPATCH_DEFAULT_HS_CODE } from "@/lib/pos/despatchLines";
import { money } from "@/lib/pos/slip";
import type { DespatchScanDto } from "@/lib/services/despatchScan.service";
import { cn } from "@/lib/utils";

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random()}`);

export interface DespatchImport {
  scan: DespatchScanDto;
  lines: CartLine[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  scans: DespatchScanDto[];
  products: TerminalProduct[] | null;
  currency: Currency;
  rate: number;
  taxPercent: number;
  taxInclusive: boolean;
  onSwitchCurrency: (c: Currency) => void;
  onImport: (result: DespatchImport) => void;
  /** Refresh the inbox after a scan was dismissed. */
  onChanged: () => void;
}

/** The till's inbox of phone-scanned despatch slips, and the screen where the cashier checks one before it enters the cart. */
export default function DespatchImportDialog({ open, onClose, scans, onChanged, ...rest }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = scans.find((s) => s.id === selectedId) ?? scans.find((s) => s.status === "ready") ?? scans[0] ?? null;

  async function dismiss(id: string) {
    const res = await fetch(`/api/pos/despatch-scans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismissed" }),
    });
    if (!res.ok) toast.error("Could not remove the slip. Try again.");
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Slips from phone</DialogTitle>
          <DialogDescription>Check each line against the photo, then add it to the sale. Nothing is invoiced until you press Fiscalise.</DialogDescription>
        </DialogHeader>

        {scans.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No slips waiting. Scan one with your phone.</p>}

        {scans.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Slips waiting">
            {scans.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={s.id === selected?.id}
                onClick={() => setSelectedId(s.id)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs transition-transform duration-150 active:scale-[0.97]",
                  s.id === selected?.id ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent"
                )}
              >
                {s.status === "processing" ? "Reading…" : s.status === "failed" ? "Could not read" : (s.slipNumber ?? "Slip")}
                <span className="ml-1.5 text-muted-foreground">{new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </button>
            ))}
          </div>
        )}

        {selected?.status === "processing" && (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Reading the slip…
          </p>
        )}

        {selected?.status === "failed" && (
          <div className="flex flex-col items-start gap-3 py-4">
            <p role="alert" className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              The slip could not be read{selected.processingError ? `: ${selected.processingError}` : "."} Take a clearer photo with the whole slip in view.
            </p>
            <Button variant="outline" size="sm" onClick={() => void dismiss(selected.id)}>
              Remove
            </Button>
          </div>
        )}

        {selected?.status === "ready" && (
          <ReviewPanel
            key={selected.id}
            scan={selected}
            {...rest}
            onDismiss={() => void dismiss(selected.id)}
            onImport={(r) => {
              rest.onImport(r);
              onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface Edit {
  qty?: string;
  price?: string;
  skip?: boolean;
  /** undefined = keep the matched product; null = no product (free text). */
  product?: TerminalProduct | null;
  confirmed?: boolean;
}

function ReviewPanel({
  scan,
  products,
  currency,
  rate,
  taxPercent,
  taxInclusive,
  onSwitchCurrency,
  onImport,
  onDismiss,
}: Omit<Props, "open" | "onClose" | "scans" | "onChanged"> & { scan: DespatchScanDto; onDismiss: () => void }) {
  const hasSlipPrices = scan.lines.some((l) => l.slipUnitPrice !== null);
  const [basis, setBasis] = useState<PriceBasis | null>(
    !hasSlipPrices ? "catalogue" : scan.pricesIncludeVat === true ? "incl" : scan.pricesIncludeVat === false ? "excl" : null
  );
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [searching, setSearching] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");

  const productsById = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const patch = (lineNo: number, e: Edit) => setEdits((prev) => ({ ...prev, [lineNo]: { ...prev[lineNo], ...e } }));

  const rows = useMemo(
    () =>
      scan.lines.map((l) => {
        const e = edits[l.lineNo] ?? {};
        const product = e.product !== undefined ? e.product : l.productId ? (productsById.get(l.productId) ?? null) : null;
        const useCatalogue = basis === "catalogue" && !!product && !product.priceOnEntry && e.price === undefined;
        let priceText = e.price;
        if (priceText === undefined) {
          if (useCatalogue && product) {
            priceText = unitPrice({ ...priceFromProduct(product), key: "", description: "", quantity: 1 }, currency, rate).toFixed(2);
          } else if (basis && basis !== "catalogue" && l.slipUnitPrice !== null) {
            priceText = slipPriceToTillPrice(l.slipUnitPrice, basis === "incl", taxInclusive, taxPercent).toFixed(2);
          } else priceText = "";
        }
        const qtyText = e.qty ?? String(l.quantity || "");
        const qty = parseQuantity(qtyText);
        const price = parsePrice(priceText);
        const needsConfirm = l.matchKind === "suggested" && e.product === undefined && !e.confirmed;
        return { l, e, product, useCatalogue, priceText, qtyText, qty, price, needsConfirm, skip: !!e.skip };
      }),
    [scan.lines, edits, productsById, basis, currency, rate, taxInclusive, taxPercent]
  );

  const active = rows.filter((r) => !r.skip);
  const cartLines: CartLine[] = useMemo(
    () =>
      active
        .filter((r) => r.qty !== null && r.price !== null)
        .map((r) => ({
          key: newKey(),
          productId: r.product?.id,
          description: r.product?.name ?? r.l.description,
          hsCode: r.product?.hsCode?.trim() || DESPATCH_DEFAULT_HS_CODE,
          quantity: r.qty as number,
          ...(r.useCatalogue && r.product ? priceFromProduct(r.product) : priceFromTyped(r.price as number, currency, rate)),
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, currency, rate]
  );
  const totals = useMemo(() => cartTotals(cartLines, currency, rate, taxPercent, taxInclusive), [cartLines, currency, rate, taxPercent, taxInclusive]);
  const comparison = compareWithSlipTotal(scan.slipGrandTotal, totals.total, totals.subtotalExcl);

  const invalid = active.filter((r) => r.qty === null || r.price === null).length;
  const unconfirmed = active.filter((r) => r.needsConfirm).length;
  const blocker =
    basis === null
      ? "Choose whether the slip's prices include VAT."
      : active.length === 0
        ? "Every line is skipped."
        : invalid > 0
          ? `${invalid} line${invalid === 1 ? " needs" : "s need"} a quantity and price.`
          : unconfirmed > 0
            ? `Confirm or change the ${unconfirmed} suggested product${unconfirmed === 1 ? "" : "s"}.`
            : products === null
              ? "Products are still loading."
              : "";

  const searchResults = searching !== null && products ? searchProducts(products, searchText, 5) : [];
  const wrongCurrency = scan.currency && scan.currency !== currency;

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="md:sticky md:top-0 md:self-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/pos/despatch-scans/${scan.id}/image`}
          alt={`Photo of despatch slip${scan.slipNumber ? ` ${scan.slipNumber}` : ""}`}
          className="max-h-[70dvh] w-full rounded-lg border bg-muted object-contain"
        />
      </div>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <span className="font-medium">{scan.slipNumber ? `Slip ${scan.slipNumber}` : "No slip number read"}</span>
          {scan.customerName && <span className="text-muted-foreground">{scan.customerName}</span>}
          {scan.slipGrandTotal !== null && <span className="ml-auto tabular-nums text-muted-foreground">Slip total {money(scan.slipGrandTotal)}</span>}
        </div>

        {scan.warnings.map((w) => (
          <p key={w} role="status" className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {w}
          </p>
        ))}

        {wrongCurrency && (
          <p role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            The slip shows {scan.currency} but this till is selling in {currency}.
            <Button size="sm" variant="outline" className="h-7" onClick={() => onSwitchCurrency(scan.currency as Currency)}>
              Sell in {scan.currency}
            </Button>
          </p>
        )}

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-muted-foreground">Prices on the slip</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["incl", "Include VAT", hasSlipPrices],
                ["excl", "Exclude VAT", hasSlipPrices],
                ["catalogue", "Use till prices", true],
              ] as [PriceBasis, string, boolean][]
            )
              .filter(([, , show]) => show)
              .map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={basis === value}
                  onClick={() => {
                    setBasis(value);
                    // A hand-typed price belongs to the old basis: drop it so the new basis applies.
                    setEdits((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, price: undefined }])));
                  }}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs transition-transform duration-150 active:scale-[0.97]",
                    basis === value ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent"
                  )}
                >
                  {label}
                </button>
              ))}
          </div>
          {basis === null && <p className="text-xs text-amber-700 dark:text-amber-300">The slip does not say. Look at it and choose.</p>}
        </fieldset>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Item</th>
                <th className="w-20 px-2 py-1.5 text-right font-medium">Qty</th>
                <th className="w-28 px-2 py-1.5 text-right font-medium">Price</th>
                <th className="w-24 px-2 py-1.5 text-right font-medium">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const lineTotal = r.qty !== null && r.price !== null ? r.qty * r.price : null;
                return (
                  <tr key={r.l.lineNo} className={cn("border-t align-top", r.skip && "opacity-40")}>
                    <td className="px-2 py-2">
                      <div className="font-medium">{r.l.description}</div>
                      <div className="text-xs text-muted-foreground">{r.l.code ? `Code ${r.l.code}` : "No code"}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        {r.product ? (
                          <span className={cn("rounded px-1.5 py-0.5", r.needsConfirm ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200" : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200")}>
                            {r.needsConfirm ? "Is it " : ""}
                            {r.product.name}
                            {r.needsConfirm ? "?" : ""}
                          </span>
                        ) : (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">Not in the catalogue (HS {DESPATCH_DEFAULT_HS_CODE})</span>
                        )}
                        {r.needsConfirm && (
                          <button type="button" onClick={() => patch(r.l.lineNo, { confirmed: true })} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 hover:bg-accent">
                            <Check className="size-3" aria-hidden /> Yes
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setSearching(searching === r.l.lineNo ? null : r.l.lineNo);
                            setSearchText(r.l.code || r.l.description);
                          }}
                          className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 hover:bg-accent"
                        >
                          <Search className="size-3" aria-hidden /> Change
                        </button>
                      </div>
                      {searching === r.l.lineNo && (
                        <div className="mt-2 space-y-1">
                          <input
                            autoFocus
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            placeholder="Search products"
                            aria-label="Search products"
                            className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                          />
                          <ul className="rounded-md border">
                            {searchResults.map((p) => (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    patch(r.l.lineNo, { product: p, price: undefined });
                                    setSearching(null);
                                  }}
                                  className="flex w-full justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
                                >
                                  <span>{p.name}</span>
                                  <span className="text-muted-foreground">{p.code}</span>
                                </button>
                              </li>
                            ))}
                            <li>
                              <button
                                type="button"
                                onClick={() => {
                                  patch(r.l.lineNo, { product: null });
                                  setSearching(null);
                                }}
                                className="w-full px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
                              >
                                Not in the catalogue: sell as written
                              </button>
                            </li>
                          </ul>
                        </div>
                      )}
                      {r.l.issues
                        .filter((i) => !i.startsWith("No matching POS product"))
                        .map((i) => (
                          <p key={i} className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                            {i}
                          </p>
                        ))}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        inputMode="decimal"
                        value={r.qtyText}
                        disabled={r.skip}
                        onChange={(e) => patch(r.l.lineNo, { qty: e.target.value })}
                        aria-label={`Quantity for ${r.l.description}`}
                        aria-invalid={!r.skip && r.qty === null}
                        className={cn("h-8 w-full rounded-md border bg-background px-2 text-right text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40", !r.skip && r.qty === null && "border-red-400")}
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        inputMode="decimal"
                        value={r.priceText}
                        disabled={r.skip}
                        onChange={(e) => patch(r.l.lineNo, { price: e.target.value })}
                        aria-label={`Price for ${r.l.description}`}
                        aria-invalid={!r.skip && r.price === null}
                        className={cn("h-8 w-full rounded-md border bg-background px-2 text-right text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40", !r.skip && r.price === null && "border-red-400")}
                      />
                      {r.l.slipUnitPrice !== null && (
                        <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">slip {r.l.slipUnitPrice}</div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{lineTotal !== null && !r.skip ? money(lineTotal) : "–"}</td>
                    <td className="px-1 py-2">
                      <button
                        type="button"
                        onClick={() => patch(r.l.lineNo, { skip: !r.skip })}
                        aria-label={r.skip ? `Include ${r.l.description}` : `Skip ${r.l.description}`}
                        title={r.skip ? "Include this line" : "Leave this line out"}
                        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Till total </span>
            <span className="font-semibold tabular-nums">
              {currency} {money(totals.total)}
            </span>
            <span className="ml-2 text-xs text-muted-foreground tabular-nums">VAT {money(totals.vat)}</span>
          </div>
          {comparison.result === "match" && <span className="text-xs text-emerald-700 dark:text-emerald-300">Matches the slip total</span>}
          {comparison.result === "match-excl" && <span className="text-xs text-emerald-700 dark:text-emerald-300">Matches the slip total before VAT</span>}
          {comparison.result === "differs" && (
            <span role="status" className="text-xs text-amber-700 dark:text-amber-300">
              {Math.abs(comparison.difference) < 0.1 ? "Rounding: " : ""}
              till is{" "}
              {money(Math.abs(comparison.difference))} {comparison.difference > 0 ? "above" : "below"} the slip total. Check it against the photo.
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Remove this slip
          </Button>
          <div className="flex items-center gap-3">
            {blocker && <span className="text-xs text-muted-foreground">{blocker}</span>}
            <Button disabled={!!blocker} onClick={() => onImport({ scan, lines: cartLines })}>
              Add to sale
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
