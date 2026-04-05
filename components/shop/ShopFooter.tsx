import Link from "next/link";

export function ShopFooter() {
  return (
    <footer className="border-t border-slate-800 bg-[#0F172A] px-4 py-10 text-slate-400">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex flex-col items-center gap-3 sm:items-start">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-white"
          >
            StockFlow Shop
          </Link>
          <nav className="flex flex-wrap justify-center gap-4 text-sm text-slate-300 sm:justify-start">
            <Link href="/cart" className="hover:text-white">
              Cart
            </Link>
            <Link href="/account" className="hover:text-white">
              My Account
            </Link>
          </nav>
        </div>
        <div className="flex flex-col items-center gap-3 sm:items-end">
          <p className="text-center text-sm sm:text-right">
            © {new Date().getFullYear()} StockFlow. All rights reserved.
          </p>
          <Link
            href="/sign-in"
            className="text-xs text-slate-500 underline-offset-4 transition hover:text-slate-300 hover:underline"
          >
            Staff sign-in
          </Link>
        </div>
      </div>
    </footer>
  );
}
