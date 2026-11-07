/**
 * Role-based access: what each role may open and do.
 *
 * Pure data and functions, no imports, so the edge proxy can use it. A permission is either a page
 * (its menu address, e.g. "/fiscal-devices") or an action (e.g. "pos.void"). Admin always has everything.
 * Branch manager and Cashier get a preset and a super admin can change it on the Menu access screen.
 */

export type AppRoleName = "admin" | "branch_user" | "cashier";

export interface PermissionDef {
  key: string;
  title: string;
  section: string;
}

/** Pages a super admin can grant or take away. Order is the order on the Menu access screen. */
export const PAGE_PERMISSIONS: PermissionDef[] = [
  { key: "/dashboard", title: "Dashboard", section: "General" },
  { key: "/uploads", title: "Upload history", section: "Uploads" },
  { key: "/uploads/upload", title: "Upload stock", section: "Uploads" },
  { key: "/branch-analytics", title: "Branch analytics", section: "Insights" },
  { key: "/product-movement", title: "Product sales trend", section: "Insights" },
  { key: "/products", title: "Stock products", section: "Insights" },
  { key: "/branch-up-reports", title: "Branch upload status", section: "Insights" },
  { key: "/ai-agent", title: "Ask AI", section: "Insights" },
  { key: "/pos", title: "Open till", section: "Point of sale" },
  { key: "/pos-sales", title: "POS sales", section: "Point of sale" },
  { key: "/pos-products", title: "POS products", section: "Point of sale" },
  { key: "/pos-customers", title: "POS customers", section: "Point of sale" },
  { key: "/pos-settings", title: "POS settings", section: "Point of sale" },
  { key: "/fiscal-day", title: "Fiscal day", section: "Fiscal" },
  { key: "/fiscal-devices", title: "Fiscal devices", section: "Fiscal" },
  { key: "/z-reports", title: "Day-end reports", section: "Fiscal" },
  { key: "/users", title: "Users", section: "Team" },
  { key: "/branches", title: "Branches", section: "Team" },
  { key: "/settings", title: "Settings (email and alerts)", section: "Settings" },
];

/** Things a person can do, as opposed to pages they can open. */
export const ACTION_PERMISSIONS: PermissionDef[] = [
  { key: "pos.void", title: "Void sales and review refused receipts", section: "Point of sale actions" },
];

export const GRANTABLE: PermissionDef[] = [...PAGE_PERMISSIONS, ...ACTION_PERMISSIONS];
export const GRANTABLE_KEYS = new Set(GRANTABLE.map((p) => p.key));

/** Admin-only pages that are not on the menu (the old Central device page now only redirects to Fiscal devices). They have no switch; only an admin opens them. */
const ADMIN_ONLY_PAGES = ["/admin/quotations", "/admin/invoices", "/exchange-rates", "/homepage", "/download-centre", "/access", "/fiscal-settings"];

/** Every address that is protected by a permission, longest first so the most specific one wins. */
const PROTECTED_PAGES = [...PAGE_PERMISSIONS.map((p) => p.key), ...ADMIN_ONLY_PAGES].sort((a, b) => b.length - a.length);

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** The permission needed to open a page address, or null when the address is not access-controlled (shop, sign-in...). */
export function pageKeyForPath(path: string): string | null {
  // These detail pages belong to the page that lists them.
  const p = path.startsWith("/uploads/view") ? "/uploads" : path;
  for (const key of PROTECTED_PAGES) if (under(p, key)) return key;
  return null;
}

/** Which permission each group of API routes needs, for roles that are confined (cashiers). Longest prefix wins. */
const API_PREFIXES: [string, string][] = [
  ["/api/admin/fiscal-day", "/fiscal-day"],
  ["/api/admin/fiscal-alerts", "/fiscal-day"],
  ["/api/admin/fiscal-devices", "/fiscal-devices"],
  ["/api/admin/fiscal-settings", "/fiscal-settings"],
  ["/api/admin/z-reports", "/z-reports"],
  ["/api/admin/email-settings", "/settings"],
  ["/api/admin/fiscal-alert-settings", "/settings"],
  ["/api/admin/products", "/products"],
  ["/api/admin/exchange-rates", "/exchange-rates"],
  ["/api/admin/invoices", "/admin/invoices"],
  ["/api/admin/quotations", "/admin/quotations"],
  ["/api/admin/menu-access", "/access"],
  ["/api/branches", "/branches"],
  ["/api/users", "/users"],
  ["/api/accounts", "/users"],
  ["/api/analytics", "/branch-analytics"],
  ["/api/products", "/products"],
  ["/api/upload", "/uploads/upload"],
  ["/api/ai-agent", "/ai-agent"],
];

/** Always reachable by a signed-in user: the till's own API, phone scan, sign-in and the user's own menu rules. */
const OPEN_API = ["/api/pos", "/api/scan", "/api/auth", "/api/menu-access"];

/**
 * For a confined role: may this API request go ahead? True for the always-open groups and for groups the
 * role holds the permission for. Anything unknown is refused.
 */
export function apiAllowed(path: string, perms: readonly string[]): boolean {
  if (OPEN_API.some((p) => under(path, p))) return true;
  const match = [...API_PREFIXES].sort((a, b) => b[0].length - a[0].length).find(([prefix]) => under(path, prefix));
  return !!match && perms.includes(match[1]);
}

/** What a role gets until a super admin changes it. Admin is every permission and is never stored. */
export const DEFAULT_PERMISSIONS: Record<Exclude<AppRoleName, "admin">, string[]> = {
  branch_user: [
    "/dashboard",
    "/uploads",
    "/uploads/upload",
    "/branch-analytics",
    "/product-movement",
    "/products",
    "/branch-up-reports",
    "/ai-agent",
    "/pos",
    "/pos-sales",
    "/pos-products",
    "/pos-customers",
  ],
  cashier: ["/pos"],
};

export function defaultPermissions(role: AppRoleName): string[] {
  return role === "admin" ? [...GRANTABLE_KEYS] : [...DEFAULT_PERMISSIONS[role]];
}

/** Admin passes everything. Everyone else needs the permission in their list. */
export function hasPermission(role: AppRoleName, perms: readonly string[] | undefined, key: string): boolean {
  if (role === "admin") return true;
  return (perms ?? defaultPermissions(role)).includes(key);
}

/** Where to send someone who opened a page they may not: the first page they are allowed to use. */
export function landingFor(perms: readonly string[]): string {
  for (const key of ["/dashboard", "/pos", ...PAGE_PERMISSIONS.map((p) => p.key)]) {
    if (perms.includes(key)) return key;
  }
  return "/unauthorized";
}
