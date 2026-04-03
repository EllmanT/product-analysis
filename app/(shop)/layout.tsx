import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CartProvider } from "@/app/(shop)/context/CartContext";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { ShopProviders } from "@/components/shop/ShopProviders";

export const metadata: Metadata = {
  title: "StockFlow Shop",
  description: "Browse products and build your order.",
};

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <ShopProviders>
      <CartProvider>
        <div className="flex min-h-screen flex-col bg-neutral-50 font-sans text-slate-900">
          <ShopHeader />
          <main className="flex-1">{children}</main>
          <ShopFooter />
        </div>
      </CartProvider>
    </ShopProviders>
  );
}
