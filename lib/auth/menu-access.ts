import { mainSidebarLinks } from "@/constants/constants";

/** The one role whose menu an admin can shape. Admin sees everything; a cashier is confined to the till. */
export const CONFIGURABLE_ROLE = "branch_user" as const;

type NavLink = { title: string; url: string; adminOnly?: boolean; hidden?: boolean };

const links = mainSidebarLinks as NavLink[];

/** Pages a branch manager is allowed to use at all. Admin-only pages stay locked: the server refuses them. */
export const configurableLinks = links.filter((l) => l.url && !l.adminOnly && !l.hidden);
export const configurableUrls = new Set(configurableLinks.map((l) => l.url));

/** Configurable pages grouped under their section heading, in menu order, for the settings screen. */
export function configurableSections(): { title: string; items: { title: string; url: string }[] }[] {
  const out: { title: string; items: { title: string; url: string }[] }[] = [];
  let current: { title: string; items: { title: string; url: string }[] } | null = null;
  for (const l of links) {
    if (!l.url) {
      current = { title: l.title, items: [] };
      out.push(current);
    } else if (configurableUrls.has(l.url)) {
      if (!current) {
        current = { title: "General", items: [] };
        out.push(current);
      }
      current.items.push({ title: l.title, url: l.url });
    }
  }
  return out.filter((s) => s.items.length > 0);
}

/** Ready-made starting points. Each lists what stays visible; everything else configurable is hidden. */
export const MENU_PRESETS: { id: string; label: string; description: string; visible: string[] | "all" }[] = [
  { id: "everything", label: "Everything", description: "All pages a branch manager can use.", visible: "all" },
  {
    id: "sales",
    label: "Sales focus",
    description: "Dashboard and the point of sale.",
    visible: ["/dashboard", "/pos", "/pos-sales", "/pos-products", "/pos-customers"],
  },
  {
    id: "stock",
    label: "Stock focus",
    description: "Dashboard, stock uploads and reports.",
    visible: ["/dashboard", "/uploads", "/uploads/upload", "/branch-analytics", "/product-movement", "/products", "/branch-up-reports", "/ai-agent"],
  },
];

export function hiddenForPreset(visible: string[] | "all"): string[] {
  if (visible === "all") return [];
  const keep = new Set(visible);
  return configurableLinks.filter((l) => !keep.has(l.url)).map((l) => l.url);
}

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
