"use client";

import { Check, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** How long the checkmark stays visible before the plus returns */
const TICK_VISIBLE_MS = 620;

type Props = {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  /** Icon box — match surrounding controls */
  size?: "sm" | "md";
  "aria-label"?: string;
};

export function CartIncrementTickButton({
  onClick,
  disabled,
  className,
  size = "md",
  "aria-label": ariaLabel = "Add to cart",
}: Props) {
  const [showTick, setShowTick] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleClick() {
    if (disabled) return;
    if (showTick) return;
    onClick();
    setShowTick(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowTick(false), TICK_VISIBLE_MS);
  }

  const iconWrap = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden transition-[background-color,color,box-shadow] duration-200",
        showTick ? "bg-emerald-50 text-emerald-700 ring-2 ring-inset ring-emerald-200" : null,
        className
      )}
    >
      <span className={cn("relative mx-auto block", iconWrap)}>
        <Plus
          strokeWidth={2}
          className={cn(
            "absolute inset-0 transition-[transform,opacity] duration-200 ease-out",
            showTick ? "scale-50 opacity-0" : "scale-100 opacity-100"
          )}
          aria-hidden
        />
        <Check
          strokeWidth={2.5}
          className={cn(
            "absolute inset-0 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.34,1.45,0.64,1)]",
            showTick ? "scale-100 opacity-100" : "scale-[0.2] opacity-0"
          )}
          aria-hidden
        />
      </span>
    </button>
  );
}
