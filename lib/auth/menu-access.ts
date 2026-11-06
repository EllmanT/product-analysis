import { type AppRoleName, defaultPermissions, GRANTABLE, GRANTABLE_KEYS, type PermissionDef } from "@/lib/auth/permissions";

/** Roles a super admin can shape on the Menu access screen. Admin always has everything. */
export const ROLE_LABELS: Record<Exclude<AppRoleName, "admin">, { title: string; blurb: string }> = {
  branch_user: { title: "Branch manager", blurb: "Runs a branch: stock, sales and reports for their own branch." },
  cashier: { title: "Cashier", blurb: "Works at the till. Give them more only if their job needs it." },
};

/** Grantable permissions grouped under their section, in menu order, for the settings screen. */
export function grantableSections(): { title: string; items: PermissionDef[] }[] {
  const out: { title: string; items: PermissionDef[] }[] = [];
  for (const p of GRANTABLE) {
    let section = out.find((s) => s.title === p.section);
    if (!section) {
      section = { title: p.section, items: [] };
      out.push(section);
    }
    section.items.push(p);
  }
  return out;
}

/** Ready-made starting points. "Standard" is whatever the role gets out of the box. */
export const MENU_PRESETS: {
  id: string;
  label: string;
  description: string;
  keys: (role: Exclude<AppRoleName, "admin">) => string[];
}[] = [
  { id: "standard", label: "Standard", description: "The usual setup for this role.", keys: (role) => defaultPermissions(role) },
  {
    id: "sales",
    label: "Sales focus",
    description: "Dashboard and the point of sale.",
    keys: () => ["/dashboard", "/pos", "/pos-sales", "/pos-products", "/pos-customers"],
  },
  {
    id: "stock",
    label: "Stock focus",
    description: "Dashboard, stock uploads and reports.",
    keys: () => ["/dashboard", "/uploads", "/uploads/upload", "/branch-analytics", "/product-movement", "/products", "/branch-up-reports", "/ai-agent"],
  },
  {
    id: "everything",
    label: "Everything",
    description: "Every page and action, like an admin. Menu access stays with super admins.",
    keys: () => [...GRANTABLE_KEYS],
  },
];

/** Drop section headings that have nothing under them. */
export function pruneEmptySections<T extends { url: string }>(items: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.url) {
      out.push(it);
      continue;
    }
    const next = items[i + 1];
    if (next && next.url) out.push(it);
  }
  return out;
}
