"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { useCart } from "@/app/(shop)/context/CartContext";

export const PLACEHOLDER_IMAGE = "https://placehold.co/400x300?text=Product";

export type ShopProductRow = {
  _id: string;
  name: string;
  standardCode: string;
  price: string | null;
  quantityAvailable: number;
  imageUrl?: string | null;
};

export function ProductSkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="aspect-[4/3] animate-pulse bg-slate-200" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
        <div className="mt-auto h-10 animate-pulse rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}

function StockBadge({ qty }: { qty: number }) {
  if (qty > 10) {
    return (
      <span className="absolute right-2 top-2 rounded-md bg-emerald-600/95 px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
        {qty} in stock
      </span>
    );
  }
  return (
    <span className="absolute right-2 top-2 rounded-md bg-amber-500/95 px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
      Only {qty} left
    </span>
  );
}

export function ProductCard({ product }: { product: ShopProductRow }) {
  const { addToCart } = useCart();
  const [added, setAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceLabel =
    product.price != null ? `$${product.price}` : "Price on request";
  const unitPrice = product.price ?? "0";
  const imgSrc = product.imageUrl?.trim() || PLACEHOLDER_IMAGE;

  useEffect(() => {
    return () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    };
  }, []);

  function handleAdd() {
    addToCart({
      productId: product._id,
      name: product.name,
      standardCode: product.standardCode,
      price: unitPrice,
      quantity: 1,
      imageUrl: product.imageUrl ?? null,
    });
    setAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAdded(false), 1000);
  }

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        <Image
          src={imgSrc}
          alt={product.name}
          fill
          className="object-cover transition duration-300 group-hover:scale-[1.02]"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          unoptimized={imgSrc.startsWith("https://placehold.co")}
        />
        <StockBadge qty={product.quantityAvailable} />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-base font-bold text-slate-900">
          {product.name}
        </h3>
        <p className="mt-1 text-xs text-slate-500">{product.standardCode}</p>
        <p className="mt-3 text-lg font-semibold text-[#2563EB]">{priceLabel}</p>
        <div className="mt-4 overflow-hidden">
          <button
            type="button"
            onClick={handleAdd}
            className={`w-full translate-y-0 rounded-lg py-2.5 text-sm font-semibold text-white transition group-hover:shadow-md ${
              added
                ? "bg-emerald-600 hover:bg-emerald-600"
                : "bg-[#2563EB] hover:bg-blue-600"
            }`}
          >
            {added ? "Added!" : "Add to Cart"}
          </button>
        </div>
      </div>
    </article>
  );
}
