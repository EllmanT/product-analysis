"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/account", label: "Dashboard", match: (p: string) => p === "/account" },
  {
    href: "/account/quotations",
    label: "Quotations",
    match: (p: string) => p.startsWith("/account/quotations"),
  },
  {
    href: "/account/invoices",
    label: "Invoices",
    match: (p: string) => p.startsWith("/account/invoices"),
  },
  {
    href: "/account/settings",
    label: "Settings",
    match: (p: string) => p.startsWith("/account/settings"),
  },
] as const;

export default function AccountLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <div className="border-b border-slate-200/80 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav
            className="-mx-1 flex gap-1 overflow-x-auto py-3"
            aria-label="Account sections"
          >
            {NAV.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      {children}
    </>
  );
}
