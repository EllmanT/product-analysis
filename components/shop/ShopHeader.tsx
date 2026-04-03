"use client";

import Link from "next/link";
import { Menu, Search, ShoppingCart, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useCart } from "@/app/(shop)/context/CartContext";
import { useShopSearch } from "./shop-search-context";

function SearchField({
  className,
  size = "md",
}: {
  className?: string;
  size?: "md" | "lg";
}) {
  const { search, setSearch } = useShopSearch();
  const padding = size === "lg" ? "py-3.5 pl-12 pr-4 text-base" : "py-2 pl-10 pr-3 text-sm";
  const iconLeft = size === "lg" ? "left-4" : "left-3";
  const iconSize = size === "lg" ? "h-5 w-5" : "h-4 w-4";

  return (
    <div className={`relative w-full ${className ?? ""}`}>
      <Search
        className={`pointer-events-none absolute top-1/2 ${iconLeft} ${iconSize} -translate-y-1/2 text-slate-400`}
        aria-hidden
      />
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search products..."
        className={`w-full rounded-lg border border-slate-200 bg-white text-slate-900 shadow-sm outline-none ring-[#2563EB] transition focus:ring-2 ${padding}`}
        aria-label="Search products"
      />
    </div>
  );
}

export function ShopHeader() {
  const { itemCount } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <header
      className={`sticky top-0 z-50 bg-[#0F172A] transition-shadow ${
        scrolled ? "shadow-lg shadow-black/20" : ""
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 lg:px-6">
        <Link
          href="/"
          className="shrink-0 text-lg font-bold tracking-tight text-white"
        >
          StockFlow Shop
        </Link>

        <div className="mx-auto hidden max-w-xl flex-1 md:block">
          <SearchField />
        </div>

        <div className="ml-auto hidden items-center gap-3 sm:flex">
          <Link
            href="/cart"
            className="relative rounded-lg p-2 text-white transition hover:bg-white/10"
            aria-label={`Shopping cart, ${itemCount} items`}
          >
            <ShoppingCart className="h-6 w-6" />
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2563EB] px-1 text-xs font-semibold text-white">
              {itemCount > 99 ? "99+" : itemCount}
            </span>
          </Link>
          <Link
            href="/login"
            className="rounded-lg border-2 border-white/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600"
          >
            Register
          </Link>
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-white hover:bg-white/10 md:hidden"
          aria-expanded={mobileOpen}
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-[60] bg-black/50 md:hidden"
          aria-hidden
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div
        className={`fixed inset-y-0 right-0 z-[70] w-[min(100%,20rem)] transform bg-[#0F172A] shadow-xl transition-transform duration-200 ease-out md:hidden ${
          mobileOpen
            ? "translate-x-0"
            : "pointer-events-none translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <span className="font-semibold text-white">Menu</span>
          <button
            type="button"
            className="rounded-lg p-2 text-white hover:bg-white/10"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="flex flex-col gap-4 p-4">
          <SearchField />
          <Link
            href="/cart"
            className="flex items-center gap-2 text-white"
            onClick={() => setMobileOpen(false)}
          >
            <ShoppingCart className="h-5 w-5" />
            Cart
            <span className="rounded-full bg-[#2563EB] px-2 py-0.5 text-xs font-semibold">
              {itemCount}
            </span>
          </Link>
          <Link
            href="/login"
            className="rounded-lg border-2 border-white/90 py-3 text-center font-semibold text-white"
            onClick={() => setMobileOpen(false)}
          >
            Login
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-[#2563EB] py-3 text-center font-semibold text-white"
            onClick={() => setMobileOpen(false)}
          >
            Register
          </Link>
        </div>
      </div>
    </header>
  );
}

export function HeroSearchField() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <SearchField size="lg" />
    </div>
  );
}
