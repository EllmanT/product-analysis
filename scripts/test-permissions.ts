/**
 * Role-based access rules: which permission a page or API needs, what each preset holds, where a refused
 * person is sent. Pure logic, no database. Run: npx tsx scripts/test-permissions.ts
 */
import assert from "node:assert/strict";

import { mainSidebarLinks } from "@/constants/constants";
import {
  ACTION_PERMISSIONS,
  apiAllowed,
  DEFAULT_PERMISSIONS,
  defaultPermissions,
  GRANTABLE_KEYS,
  hasPermission,
  landingFor,
  pageKeyForPath,
  PAGE_PERMISSIONS,
} from "@/lib/auth/permissions";

let n = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log("ok  ", name);
};

ok("every menu item has a permission, so a new page cannot be left uncontrolled", () => {
  const known = new Set([...PAGE_PERMISSIONS.map((p) => p.key), "/admin/quotations", "/admin/invoices", "/exchange-rates"]);
  const missing = (mainSidebarLinks as { url: string }[]).filter((l) => l.url && !known.has(pageKeyForPath(l.url) ?? l.url)).map((l) => l.url);
  assert.deepEqual(missing, []);
});

ok("every permission in a preset is one that can be granted", () => {
  for (const role of ["branch_user", "cashier"] as const) {
    for (const k of DEFAULT_PERMISSIONS[role]) assert.ok(GRANTABLE_KEYS.has(k), `${role}: ${k}`);
  }
});

ok("page addresses map to the right permission, most specific first", () => {
  assert.equal(pageKeyForPath("/pos"), "/pos");
  assert.equal(pageKeyForPath("/pos-sales"), "/pos-sales");
  assert.equal(pageKeyForPath("/pos-sales/abc123"), "/pos-sales");
  assert.equal(pageKeyForPath("/uploads/upload"), "/uploads/upload");
  assert.equal(pageKeyForPath("/uploads/view"), "/uploads");
  assert.equal(pageKeyForPath("/uploads"), "/uploads");
  assert.equal(pageKeyForPath("/products/5f"), "/products");
  assert.equal(pageKeyForPath("/z-reports/1/print"), "/z-reports");
  assert.equal(pageKeyForPath("/admin/invoices/9"), "/admin/invoices");
  assert.equal(pageKeyForPath("/access"), "/access");
});

ok("shop and sign-in addresses are not access controlled", () => {
  for (const p of ["/", "/browse", "/cart", "/checkout", "/sign-in", "/login", "/account/quotations", "/unauthorized"]) {
    assert.equal(pageKeyForPath(p), null, p);
  }
});

ok("a lookalike prefix does not match (/pos vs /pos-sales vs /posx)", () => {
  assert.equal(pageKeyForPath("/posx"), null);
  assert.equal(pageKeyForPath("/branches-old"), null);
});

ok("admin passes everything; others need the permission", () => {
  assert.equal(hasPermission("admin", undefined, "/fiscal-devices"), true);
  assert.equal(hasPermission("branch_user", undefined, "/fiscal-devices"), false);
  assert.equal(hasPermission("branch_user", undefined, "/pos-sales"), true);
  assert.equal(hasPermission("branch_user", ["/fiscal-devices"], "/fiscal-devices"), true);
  assert.equal(hasPermission("cashier", undefined, "/pos"), true);
  assert.equal(hasPermission("cashier", undefined, "/pos-sales"), false);
});

ok("pages nobody can be granted stay admin-only", () => {
  for (const k of ["/access", "/exchange-rates", "/admin/invoices", "/admin/quotations", "/homepage"]) {
    assert.equal(hasPermission("branch_user", [...GRANTABLE_KEYS], k), false, k);
  }
});

ok("action permissions exist and default to admin only", () => {
  for (const a of ACTION_PERMISSIONS) {
    assert.equal(hasPermission("branch_user", undefined, a.key), false, a.key);
    assert.equal(hasPermission("cashier", undefined, a.key), false, a.key);
  }
  assert.equal(hasPermission("admin", undefined, "pos.void"), true);
});

ok("a cashier is confined to the till's API by default", () => {
  const perms = defaultPermissions("cashier");
  assert.equal(apiAllowed("/api/pos/sales", perms), true);
  assert.equal(apiAllowed("/api/pos/summary", perms), true);
  assert.equal(apiAllowed("/api/scan/upload", perms), true);
  assert.equal(apiAllowed("/api/menu-access", perms), true);
  assert.equal(apiAllowed("/api/analytics/time-series", perms), false);
  assert.equal(apiAllowed("/api/admin/fiscal-day/status", perms), false);
  assert.equal(apiAllowed("/api/admin/fiscal-day/overview", perms), false);
  assert.equal(apiAllowed("/api/users", perms), false);
  assert.equal(apiAllowed("/api/shop/quotations", perms), false);
  assert.equal(apiAllowed("/api/unknown", perms), false);
});

ok("granting a cashier a page opens exactly that page's API", () => {
  const perms = [...defaultPermissions("cashier"), "/products"];
  assert.equal(apiAllowed("/api/admin/products", perms), true);
  assert.equal(apiAllowed("/api/products/export", perms), true);
  assert.equal(apiAllowed("/api/admin/fiscal-day/open", perms), false);
});

ok("the longest prefix wins for APIs", () => {
  const perms = ["/fiscal-settings"];
  assert.equal(apiAllowed("/api/admin/fiscal-settings/register", perms), true);
  assert.equal(apiAllowed("/api/admin/fiscal-devices/abc", perms), false);
});

ok("a refused person lands on a page they are allowed to use", () => {
  assert.equal(landingFor(defaultPermissions("cashier")), "/pos");
  assert.equal(landingFor(defaultPermissions("branch_user")), "/dashboard");
  assert.equal(landingFor(["/products"]), "/products");
  assert.equal(landingFor([]), "/unauthorized");
});

console.log(`\n${n} checks passed`);
