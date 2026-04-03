"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";

import { useCart } from "@/app/(shop)/context/CartContext";

function formatMoney(s: string): string {
  const n = parseFloat(s);
  if (Number.isNaN(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function lineAmount(price: string, qty: number): string {
  const u = parseFloat(price);
  if (Number.isNaN(u)) return "0.00";
  return (u * qty).toFixed(2);
}

export default function CartPage() {
  const router = useRouter();
  const { items, updateQuantity, removeFromCart } = useCart();

  const subtotal = items.reduce((sum, row) => {
    const n = parseFloat(lineAmount(row.price, row.quantity));
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);

  async function proceedCheckout() {
    const res = await fetch("/api/shop/customer/me", { credentials: "include" });
    if (res.status === 401) {
      router.push("/login?redirect=/checkout");
      return;
    }
    router.push("/checkout");
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-4 py-24 text-center">
        <ShoppingCart
          className="h-24 w-24 text-slate-300"
          strokeWidth={1.25}
          aria-hidden
        />
        <h1 className="mt-8 text-3xl font-bold text-slate-900">Your cart is empty</h1>
        <p className="mt-2 text-slate-600">
          Add products from the shop to build your order.
        </p>
        <Link
          href="/"
          className="mt-8 rounded-lg bg-[#2563EB] px-8 py-3 text-sm font-semibold text-white transition hover:bg-blue-600"
        >
          Browse Products
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        Your Cart
      </h1>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {items.map((row) => {
            const line = lineAmount(row.price, row.quantity);
            return (
              <div
                key={row.productId}
                className="flex flex-col gap-4 rounded-xl bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{row.name}</p>
                  <p className="text-sm text-slate-500">{row.standardCode}</p>
                  <p className="mt-2 text-sm text-slate-700">
                    Unit:{" "}
                    <span className="font-medium text-[#2563EB]">
                      {formatMoney(row.price)}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                  <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      className="px-3 py-2 text-slate-700 hover:bg-slate-100"
                      onClick={() =>
                        updateQuantity(row.productId, row.quantity - 1)
                      }
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      className="w-14 border-x border-slate-200 bg-white py-2 text-center text-sm font-medium outline-none"
                      value={row.quantity}
                      onChange={(e) =>
                        updateQuantity(
                          row.productId,
                          parseInt(e.target.value, 10) || 1
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      className="px-3 py-2 text-slate-700 hover:bg-slate-100"
                      onClick={() =>
                        updateQuantity(row.productId, row.quantity + 1)
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="min-w-[5rem] text-right font-semibold text-slate-900">
                    {formatMoney(line)}
                  </p>
                  <button
                    type="button"
                    aria-label="Remove item"
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    onClick={() => removeFromCart(row.productId)}
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <aside className="h-fit rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Order summary</h2>
          <ul className="mt-4 space-y-2 border-b border-slate-100 pb-4">
            {items.map((row) => (
              <li
                key={row.productId}
                className="flex justify-between text-sm text-slate-600"
              >
                <span className="truncate pr-2">
                  {row.name} × {row.quantity}
                </span>
                <span className="shrink-0 font-medium text-slate-800">
                  {formatMoney(lineAmount(row.price, row.quantity))}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between text-base font-bold text-slate-900">
            <span>Total</span>
            <span>{formatMoney(subtotal.toFixed(2))}</span>
          </div>
          <button
            type="button"
            onClick={() => void proceedCheckout()}
            className="mt-6 w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white transition hover:bg-blue-600"
          >
            Proceed to Checkout
          </button>
        </aside>
      </div>
    </div>
  );
}
