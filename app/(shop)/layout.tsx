import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";

import { CartProvider } from "@/app/(shop)/context/CartContext";
import { CartDrawerProvider } from "@/components/shop/CartDrawerContext";
import { CartDrawer } from "@/components/shop/CartDrawer";
import { DocumentMatchProvider } from "@/components/shop/document-match/DocumentMatchContext";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { ShopProviders } from "@/components/shop/ShopProviders";
import { verifyShopJwt } from "@/lib/shop/jwt";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-shop-body",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-shop-display",
  display: "swap",
});

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
      <CartProvider>
        <DocumentMatchProvider>
          <CartDrawerProvider>
            <div
              className={`${dmSans.variable} ${cormorant.variable} flex min-h-screen flex-col bg-neutral-50 font-shop-body text-slate-900 antialiased`}
            >
              <ShopHeader customer={customer} />
              <main className="flex-1">{children}</main>
              <ShopFooter />
              <CartDrawer />
            </div>
          </CartDrawerProvider>
        </DocumentMatchProvider>
      </CartProvider>
    </ShopProviders>
  );
}
