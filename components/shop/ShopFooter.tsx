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
            <Link href="/quotations" className="hover:text-white">
              My quotations
            </Link>
          </nav>
        </div>
        <p className="text-sm">
          © {new Date().getFullYear()} StockFlow. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
