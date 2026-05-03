"use client";

import { Minus } from "lucide-react";
import { useCallback, useState } from "react";

import { CartIncrementTickButton } from "@/components/shop/CartIncrementTickButton";

type Props = {
  productId: string;
  quantity: number;
  updateQuantity: (productId: string, quantity: number) => void;
  /** Tighter control row for the slide-out cart drawer */
  size?: "md" | "sm";
  /** e.g. border on light vs white background */
  inputClassName?: string;
};

function effectiveBase(draft: string, quantity: number): number {
  const t = draft.trim();
  if (t === "") return quantity;
  const n = Math.floor(parseInt(t, 10));
  return Number.isNaN(n) || n < 1 ? quantity : n;
}

export function CartQuantityControl({
  productId,
  quantity,
  updateQuantity,
  size = "md",
  inputClassName = "border-slate-200 bg-white",
}: Props) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);

  const displayValue = focused ? draft : String(quantity);

  const commitFromDraft = useCallback(
    (raw: string) => {
      const t = raw.trim();
      if (t === "" || t === "0") {
        updateQuantity(productId, 0);
        return;
      }
      const n = Math.floor(parseInt(t, 10));
      if (Number.isNaN(n) || n < 1) {
        setDraft(String(quantity));
        return;
      }
      updateQuantity(productId, n);
    },
    [productId, quantity, updateQuantity]
  );

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v !== "" && !/^\d*$/.test(v)) return;
    setDraft(v);
    if (v === "" || v === "0") return;
    const n = Math.floor(parseInt(v, 10));
    if (!Number.isNaN(n) && n >= 1) {
      updateQuantity(productId, n);
    }
  };

  const onBlur = () => {
    commitFromDraft(draft);
    setFocused(false);
  };

  const onFocus = () => {
    setFocused(true);
    setDraft(String(quantity));
  };

  const adjust = (delta: number) => {
    const base = effectiveBase(
      focused ? draft : String(quantity),
      quantity
    );
    updateQuantity(productId, base + delta);
  };

  const isSm = size === "sm";
  const btn = isSm
    ? "flex h-7 w-7 items-center justify-center text-slate-500 transition hover:bg-slate-100"
    : "px-3 py-2 text-slate-700 transition hover:bg-slate-100";
  const inputWidth = isSm
    ? "min-w-[1.75rem] w-12 max-w-[4.5rem] px-1"
    : "min-w-[2.5rem] w-16 max-w-[5.5rem]";

  return (
    <div
      className={
        isSm
          ? "flex items-center gap-1 rounded-lg border border-slate-200"
          : "flex items-center rounded-lg border border-slate-200 bg-slate-50"
      }
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        className={btn}
        onClick={() => adjust(-1)}
      >
        <Minus className={isSm ? "h-3 w-3" : "h-4 w-4"} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={`${inputWidth} border-x text-center text-sm font-medium text-slate-900 outline-none transition hover:cursor-text focus:cursor-text ${
          isSm ? "h-7 border-slate-200 py-0" : "border-slate-200 py-2"
        } ${inputClassName}`}
        value={displayValue}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-label="Quantity"
      />
      <CartIncrementTickButton
        size={isSm ? "sm" : "md"}
        aria-label="Increase quantity"
        className={btn}
        onClick={() => adjust(1)}
      />
    </div>
  );
}
