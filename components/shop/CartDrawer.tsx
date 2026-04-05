"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { Drawer } from "vaul";

import { useCart } from "@/app/(shop)/context/CartContext";
import { useCartDrawer } from "./CartDrawerContext";
import { PLACEHOLDER_IMAGE } from "./ProductCard";

function InitialsAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-500">
      {initials || "?"}
    </div>
  );
}

export function CartDrawer() {
  const { isOpen, closeDrawer } = useCartDrawer();
  const { items, itemCount, updateQuantity, removeFromCart, clearCart } =
    useCart();

  const subtotal = items.reduce((sum, item) => {
    const p = parseFloat(item.price) || 0;
    return sum + p * item.quantity;
  }, 0);

  return (
    <Drawer.Root
      direction="right"
      open={isOpen}
      onOpenChange={(open) => !open && closeDrawer()}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]" />
        <Drawer.Content
          data-vaul-drawer-direction="right"
          className="fixed bottom-0 right-0 top-0 z-[90] flex w-[min(100%,26rem)] flex-col bg-white shadow-2xl outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-slate-700" />
              <h2 className="text-lg font-semibold text-slate-900">
                Your Cart
              </h2>
              {itemCount > 0 && (
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                  {itemCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  Clear all
                </button>
              )}
              <Drawer.Close asChild>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close cart"
                >
                  <X className="h-5 w-5" />
                </button>
              </Drawer.Close>
            </div>
          </div>

          {/* Items list */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                <ShoppingCart className="h-12 w-12 text-slate-200" />
                <p className="text-slate-500">Your cart is empty</p>
                <Drawer.Close asChild>
                  <Link
                    href="/browse"
                    className="mt-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    Browse Products
                  </Link>
                </Drawer.Close>
              </div>
            ) : (
              <ul className="space-y-4">
                {items.map((item) => {
                  const lineTotal =
                    (parseFloat(item.price) || 0) * item.quantity;
                  const imgSrc = item.imageUrl?.trim() || PLACEHOLDER_IMAGE;

                  return (
                    <li
                      key={item.productId}
                      className="flex gap-3 rounded-xl border border-slate-100 p-3"
                    >
                      {/* Product image */}
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {item.imageUrl?.trim() ? (
                          <Image
                            src={imgSrc}
                            alt={item.name}
                            fill
                            className="object-cover"
                            sizes="56px"
                            unoptimized={imgSrc.startsWith(
                              "https://placehold.co"
                            )}
                          />
                        ) : (
                          <InitialsAvatar name={item.name} />
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
                          {item.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {item.standardCode}
                        </p>

                        <div className="mt-2 flex items-center justify-between">
                          {/* Qty controls */}
                          <div className="flex items-center gap-1 rounded-lg border border-slate-200">
                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(
                                  item.productId,
                                  item.quantity - 1
                                )
                              }
                              className="flex h-7 w-7 items-center justify-center text-slate-500 transition hover:bg-slate-100"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="min-w-[1.5rem] text-center text-sm font-semibold text-slate-900">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(
                                  item.productId,
                                  item.quantity + 1
                                )
                              }
                              className="flex h-7 w-7 items-center justify-center text-slate-500 transition hover:bg-slate-100"
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>

                          {/* Line total + remove */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">
                              ${lineTotal.toFixed(2)}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.productId)}
                              className="rounded-lg p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                              aria-label="Remove item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="border-t border-slate-100 px-5 py-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm text-slate-600">
                  Subtotal ({itemCount} item{itemCount !== 1 ? "s" : ""})
                </span>
                <span className="text-lg font-bold text-slate-900">
                  ${subtotal.toFixed(2)}
                </span>
              </div>
              <Drawer.Close asChild>
                <Link
                  href="/checkout"
                  className="block w-full rounded-xl bg-blue-600 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99]"
                >
                  Proceed to Checkout
                </Link>
              </Drawer.Close>
              <Drawer.Close asChild>
                <button
                  type="button"
                  className="mt-2 w-full rounded-xl py-2.5 text-sm text-slate-500 transition hover:bg-slate-50"
                >
                  Continue Shopping
                </button>
              </Drawer.Close>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
