import Image from "next/image";

import { cn } from "@/lib/utils";

const SIZES = {
  sm: { mark: 20, text: "text-sm" },
  md: { mark: 24, text: "text-base" },
  lg: { mark: 40, text: "text-2xl" },
} as const;

/**
 * The StockFlow logo: the F mark and the name. One place so every screen shows the same thing.
 * The mark is decorative; the name is the accessible label. `showName={false}` leaves only the mark (narrow bars).
 */
export default function Logo({
  size = "md",
  showName = true,
  onDark = false,
  className,
  nameClassName,
}: {
  size?: keyof typeof SIZES;
  showName?: boolean;
  /** The background is always dark (the shop sign-in): use the white mark whatever the theme. */
  onDark?: boolean;
  className?: string;
  nameClassName?: string;
}) {
  const s = SIZES[size];
  const mark = { width: s.mark, height: Math.round(s.mark * 0.97), alt: "", "aria-hidden": true as const, unoptimized: true };
  return (
    <span className={cn("inline-flex items-center gap-2", className)} aria-label={showName ? undefined : "StockFlow"}>
      {!onDark && <Image src="/images/stockflow-mark.svg" {...mark} className="shrink-0 dark:hidden" />}
      <Image src="/images/stockflow-mark-white.svg" {...mark} className={onDark ? "shrink-0" : "hidden shrink-0 dark:block"} />
      {showName && <span className={cn("font-semibold tracking-tight", s.text, nameClassName)}>StockFlow</span>}
    </span>
  );
}
