/** What the Fiscal day and Fiscal devices pages show for a device's day. Pure, so it can be tested alone. */
export type DayState = "open" | "not_managed" | "closed" | "close_failed" | "unreachable";

/**
 * `managed` is false when ZIMRA says a day is open but the fiscal service does not hold it (it was opened by another
 * tool). The service refuses such a day because its receipt counters are unknown, so it must not read as plain "open".
 */
export function dayStateOf(isOpen: boolean, health: { reachable: boolean; dayStatus?: string } | undefined, managed: boolean | null = true): DayState {
  if (!health || !health.reachable) return "unreachable";
  if (health.dayStatus === "FiscalDayCloseFailed") return "close_failed";
  if (isOpen && managed === false) return "not_managed";
  return isOpen ? "open" : "closed";
}
