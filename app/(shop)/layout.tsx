import { redirect } from "next/navigation";
import { ClerkProvider } from "@clerk/nextjs";
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
import Customer from "@/database/customer.model";
import dbConnect from "@/lib/mongoose";
import { getShopCustomerIdForRequest } from "@/lib/shop/customer-auth";
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
  redirect("/sign-in");

  let customer: { firstName: string; id: string } | null = null;

  try {
    await dbConnect();
    const resolvedId = await getShopCustomerIdForRequest();
    const cookieStore = await cookies();
    const token = cookieStore.get("shop_token")?.value ?? null;
    const payload = token ? verifyShopJwt(token) : null;

    if (resolvedId) {
      const row = await Customer.findById(resolvedId)
        .select("firstName")
        .lean();
      if (row && !Array.isArray(row)) {
        const r = row as unknown as { firstName?: string };
        customer = {
          firstName: (typeof r.firstName === "string" && r.firstName.trim()) || "User",
          id: resolvedId,
        };
      }
    } else if (payload) {
      customer = { firstName: payload.firstName || "User", id: payload.sub };
    }
  } catch {
    const cookieStore = await cookies();
    const token = cookieStore.get("shop_token")?.value ?? null;
    const payload = token ? verifyShopJwt(token) : null;
    if (payload?.sub) {
      customer = { firstName: payload.firstName || "User", id: payload.sub };
    }
  }

  return (
    <ClerkProvider>
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
    </ClerkProvider>
  );
}
