import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";

import { CartProvider } from "@/app/(shop)/context/CartContext";
import { CartDrawerProvider } from "@/components/shop/CartDrawerContext";
import { CartDrawer } from "@/components/shop/CartDrawer";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { ShopProviders } from "@/components/shop/ShopProviders";
import { verifyShopJwt } from "@/lib/shop/jwt";

export const metadata: Metadata = {
  title: "StockFlow Shop",
  description: "Browse products and build your order.",
};

export default async function ShopLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("shop_token")?.value ?? null;
  const payload = token ? verifyShopJwt(token) : null;
  const customer = payload
    ? { firstName: payload.firstName || "User", id: payload.sub }
    : null;

  return (
    <ShopProviders>
      {/* Load DM Sans + Syne from Google Fonts for premium dashboard typography */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Syne:wght@400;600;700;800&display=swap"
      />
      <CartProvider>
        <CartDrawerProvider>
          <div className="flex min-h-screen flex-col bg-neutral-50 font-sans text-slate-900">
            <ShopHeader customer={customer} />
            <main className="flex-1">{children}</main>
            <ShopFooter />
            <CartDrawer />
          </div>
        </CartDrawerProvider>
      </CartProvider>
    </ShopProviders>
  );
}
