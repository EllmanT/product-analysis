"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  Search,
  ShoppingCart,
  Warehouse,
  X,
  LayoutDashboard,
  FileText,
  Receipt,
  LogOut,
  Settings,
} from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";

import { useCart } from "@/app/(shop)/context/CartContext";
import { ShopDocumentUploadTrigger } from "./document-match/ShopDocumentUploadTrigger";
import { useCartDrawer } from "./CartDrawerContext";
import { useShopSearch, HeroVisibilityContext } from "./shop-search-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ShopHeaderCustomer {
  firstName: string;
  id: string;
}

function SearchField({
  className,
  onFocus,
  onBlur,
}: {
  className?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const { search, setSearch } = useShopSearch();

  return (
    <div className={`relative w-full ${className ?? ""}`}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="Search products..."
        className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-900 shadow-sm outline-none ring-blue-500/30 placeholder:text-slate-400 transition focus:bg-white focus:ring-2"
        aria-label="Search products"
      />
    </div>
  );
}

function CustomerAvatar({
  customer,
}: {
  customer: ShopHeaderCustomer;
}) {
  const router = useRouter();
  const initials = customer.firstName.charAt(0).toUpperCase();

  async function handleSignOut() {
    await fetch("/api/shop/auth/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white ring-2 ring-slate-200 transition hover:ring-slate-300"
          aria-label="Account menu"
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-slate-500">
          Hi, {customer.firstName}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account" className="flex cursor-pointer items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            My Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/quotations" className="flex cursor-pointer items-center gap-2">
            <FileText className="h-4 w-4" />
            My Quotations
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/invoices" className="flex cursor-pointer items-center gap-2">
            <Receipt className="h-4 w-4" />
            My Invoices
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/settings" className="flex cursor-pointer items-center gap-2">
            <Settings className="h-4 w-4" />
            Account settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="flex cursor-pointer items-center gap-2 text-red-600 focus:text-red-600"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ShopHeader({
  customer,
}: {
  customer: ShopHeaderCustomer | null;
}) {
  const { itemCount } = useCart();
  const { toggleDrawer } = useCartDrawer();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrollActive, setScrollActive] = useState(false);
  const [navSearchFocused, setNavSearchFocused] = useState(false);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pathname = usePathname();
  const isHomePage = pathname === "/";
  const { heroVisible } = useContext(HeroVisibilityContext);
  const routeAllowsNavSearch = !isHomePage || !heroVisible;
  const showNavSearch =
    routeAllowsNavSearch &&
    scrolled &&
    (scrollActive || navSearchFocused);

  useEffect(() => {
    const clearIdleTimer = () => {
      if (scrollIdleTimerRef.current) {
        clearTimeout(scrollIdleTimerRef.current);
        scrollIdleTimerRef.current = null;
      }
    };

    const onScroll = () => {
      setScrolled(window.scrollY > 4);
      setScrollActive(true);
      clearIdleTimer();
      scrollIdleTimerRef.current = setTimeout(() => {
        setScrollActive(false);
        scrollIdleTimerRef.current = null;
      }, 320);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearIdleTimer();
    };
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
      className={`sticky top-0 z-50 border-b border-slate-200/80 bg-white/85 backdrop-blur-md transition-shadow ${
        scrolled ? "shadow-sm shadow-slate-200/50" : ""
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 lg:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-slate-900"
        >
          <Warehouse className="h-5 w-5 text-blue-600" />
          <span className="text-lg font-bold tracking-tight">StockFlow</span>
        </Link>

        {/* Scroll-aware search (desktop) */}
        <div
          className={`mx-auto hidden max-w-xl flex-1 transition-all duration-300 md:block ${
            showNavSearch
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          aria-hidden={!showNavSearch}
        >
          <div className="flex w-full items-center gap-2">
            <SearchField
              className="min-w-0 flex-1"
              onFocus={() => setNavSearchFocused(true)}
              onBlur={() => setNavSearchFocused(false)}
            />
            <ShopDocumentUploadTrigger />
          </div>
        </div>

        {/* Desktop right side */}
        <div className="ml-auto hidden items-center gap-3 sm:flex">
          {/* Cart button */}
          <button
            type="button"
            onClick={toggleDrawer}
            className="relative rounded-lg p-2 text-slate-700 transition hover:bg-slate-100"
            aria-label={`Shopping cart, ${itemCount} items`}
          >
            <ShoppingCart className="h-6 w-6" />
            {itemCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-xs font-semibold text-white">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            )}
          </button>

          {/* Auth */}
          {customer ? (
            <CustomerAvatar customer={customer} />
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Register
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="ml-auto rounded-lg p-2 text-slate-700 hover:bg-slate-100 sm:hidden"
          aria-expanded={mobileOpen}
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-6 w-6" />
        </button>

        {/* Mobile cart icon always visible */}
        <button
          type="button"
          onClick={toggleDrawer}
          className="relative rounded-lg p-2 text-slate-700 transition hover:bg-slate-100 sm:hidden"
          aria-label={`Shopping cart, ${itemCount} items`}
        >
          <ShoppingCart className="h-6 w-6" />
          {itemCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-xs font-semibold text-white">
              {itemCount > 99 ? "99+" : itemCount}
            </span>
          )}
        </button>
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 sm:hidden"
          aria-hidden
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-[70] w-[min(100%,20rem)] transform border-l border-slate-200 bg-white shadow-xl transition-transform duration-200 ease-out sm:hidden ${
          mobileOpen
            ? "translate-x-0"
            : "pointer-events-none translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-blue-600" />
            <span className="font-semibold text-slate-900">StockFlow</span>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <SearchField className="min-w-0 flex-1" />
            <ShopDocumentUploadTrigger />
          </div>

          {customer ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <p className="text-sm font-semibold text-slate-900">
                Hi, {customer.firstName}
              </p>
              <div className="mt-2 flex flex-col gap-1">
                <Link
                  href="/account"
                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-600 hover:bg-white"
                  onClick={() => setMobileOpen(false)}
                >
                  <LayoutDashboard className="h-4 w-4" /> My Dashboard
                </Link>
                <Link
                  href="/account/quotations"
                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-600 hover:bg-white"
                  onClick={() => setMobileOpen(false)}
                >
                  <FileText className="h-4 w-4" /> My Quotations
                </Link>
                <Link
                  href="/account/invoices"
                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-600 hover:bg-white"
                  onClick={() => setMobileOpen(false)}
                >
                  <Receipt className="h-4 w-4" /> My Invoices
                </Link>
              </div>
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full border border-slate-200 py-3 text-center font-semibold text-slate-800"
                onClick={() => setMobileOpen(false)}
              >
                Login
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-blue-600 py-3 text-center font-semibold text-white hover:bg-blue-700"
                onClick={() => setMobileOpen(false)}
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/** Legacy export kept for backwards compatibility — no longer used */
export function HeroSearchField() {
  return null;
}
