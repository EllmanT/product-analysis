"use client";

import { useCart } from "@/app/(shop)/context/CartContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  DocumentMatchRow,
  ShopProductMatchRow,
} from "@/types/shop-document-match";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function priceLabel(price: string | null): string {
  return price != null && price.length > 0 ? `$${price}` : "Price on request";
}

export function DocumentMatchReviewDialog({
  open,
  onOpenChange,
  rows,
  onClose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: DocumentMatchRow[] | null;
  onClose: () => void;
}) {
  const { addToCart } = useCart();
  const [picked, setPicked] = useState<
    Record<number, ShopProductMatchRow | null>
  >({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [rejected, setRejected] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!open || !rows) return;
    const nextPicked: Record<number, ShopProductMatchRow | null> = {};
    const nextChecked: Record<number, boolean> = {};
    for (const r of rows) {
      nextPicked[r.index] = r.match;
      nextChecked[r.index] = r.status === "matched";
    }
    setPicked(nextPicked);
    setChecked(nextChecked);
    setRejected(new Set());
  }, [open, rows]);

  const optionsByIndex = useMemo(() => {
    const map = new Map<number, ShopProductMatchRow[]>();
    if (!rows) return map;
    for (const r of rows) {
      if (r.status !== "matched" || !r.match) continue;
      const list: ShopProductMatchRow[] = [r.match];
      const ids = new Set(list.map((p) => p._id));
      for (const alt of r.alternates) {
        if (!ids.has(alt._id)) {
          ids.add(alt._id);
          list.push(alt);
        }
      }
      map.set(r.index, list);
    }
    return map;
  }, [rows]);

  function toggleRejected(index: number) {
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else {
        next.add(index);
        setChecked((c) => ({ ...c, [index]: false }));
      }
      return next;
    });
  }

  function approveAllMatched() {
    if (!rows) return;
    setChecked((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (r.status === "matched" && !rejected.has(r.index)) {
          next[r.index] = true;
        }
      }
      return next;
    });
  }

  function addSelectedToCart() {
    if (!rows) return;
    let n = 0;
    for (const r of rows) {
      if (rejected.has(r.index)) continue;
      if (!checked[r.index]) continue;
      const product = picked[r.index];
      if (!product) continue;
      const qty = r.extracted.quantity ?? 1;
      const unitPrice = product.price ?? "0";
      addToCart({
        productId: product._id,
        name: product.name,
        standardCode: product.standardCode,
        price: unitPrice,
        quantity: qty,
        imageUrl: product.imageUrl ?? null,
      });
      n += 1;
    }
    if (n === 0) {
      toast.message("Select at least one row to add, or fix rejected items.");
      return;
    }
    toast.success(`Added ${n} item(s) to your cart.`);
    onClose();
    onOpenChange(false);
  }

  if (!rows) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(90vh,720px)] gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton
      >
        <DialogHeader className="border-b border-slate-200 px-6 py-4 text-left">
          <DialogTitle>Review matched products</DialogTitle>
          <DialogDescription>
            Confirm each line before adding to your cart. Reject anything that
            does not look right.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(52vh,420px)] overflow-y-auto px-6 py-4">
          <ul className="flex flex-col gap-4">
            {rows.map((r) => {
              const isRej = rejected.has(r.index);
              const product = picked[r.index] ?? null;
              const opts = optionsByIndex.get(r.index) ?? [];

              return (
                <li
                  key={r.index}
                  className={`rounded-xl border p-4 transition-colors ${
                    isRej
                      ? "border-amber-200 bg-amber-50/50 opacity-80"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        From your document
                      </p>
                      <p className="mt-0.5 font-medium text-slate-900">
                        {r.extracted.description}
                        {r.extracted.quantity != null ? (
                          <span className="font-normal text-slate-600">
                            {" "}
                            × {r.extracted.quantity}
                            {r.extracted.unit
                              ? ` ${r.extracted.unit}`
                              : ""}
                          </span>
                        ) : null}
                      </p>
                      {r.extracted.skuOrCode ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Code in file: {r.extracted.skuOrCode}
                        </p>
                      ) : null}
                    </div>
                    {r.status === "matched" && !isRej ? (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`dm-${r.index}`}
                          checked={!!checked[r.index]}
                          onCheckedChange={(v) =>
                            setChecked((c) => ({
                              ...c,
                              [r.index]: v === true,
                            }))
                          }
                          aria-label={`Include ${r.extracted.description} in cart`}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-3 border-t border-slate-100 pt-3">
                    {r.status === "unavailable" ? (
                      <p className="text-sm text-amber-800">
                        {r.reason ??
                          "Not found in our in-stock catalog for a confident match."}
                      </p>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-slate-500">
                          Suggested product
                          {r.confidence ? (
                            <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                              {r.confidence} confidence
                            </span>
                          ) : null}
                        </p>
                        {product ? (
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-semibold text-slate-900">
                                {product.name}
                              </p>
                              <p className="text-sm text-slate-600">
                                {product.standardCode} ·{" "}
                                {priceLabel(product.price)} ·{" "}
                                {product.quantityAvailable} in stock
                              </p>
                            </div>
                            {opts.length > 1 ? (
                              <Select
                                value={product._id}
                                onValueChange={(id) => {
                                  const next = opts.find((p) => p._id === id);
                                  if (next) {
                                    setPicked((p) => ({
                                      ...p,
                                      [r.index]: next,
                                    }));
                                  }
                                }}
                              >
                                <SelectTrigger className="w-full sm:w-[220px]">
                                  <SelectValue placeholder="Other matches" />
                                </SelectTrigger>
                                <SelectContent>
                                  {opts.map((p) => (
                                    <SelectItem key={p._id} value={p._id}>
                                      {p.name} ({p.standardCode})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>

                  {r.status === "matched" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={isRej ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => toggleRejected(r.index)}
                      >
                        {isRej ? "Undo reject" : "Not the right product"}
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        <DialogFooter className="flex-col gap-2 border-t border-slate-200 px-6 py-4 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={approveAllMatched}
              disabled={!rows.some((r) => r.status === "matched")}
            >
              Select all matched
            </Button>
            <Button type="button" onClick={addSelectedToCart}>
              Add selected to cart
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
