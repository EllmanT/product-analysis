/** Formats integers for compact display (e.g. 1.2k). */
export function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  const rounded = Math.floor(n);
  if (rounded < 1000) return String(rounded);
  if (rounded < 1_000_000) {
    const k = rounded / 1000;
    const decimals = rounded % 1000 === 0 ? 0 : 1;
    return `${k.toFixed(decimals)}k`;
  }
  const m = rounded / 1_000_000;
  return `${m.toFixed(1)}M`;
}
