"use client";

import Image from "next/image";
import { memo } from "react";

import { useCart } from "@/app/(shop)/context/CartContext";
import { CartIncrementTickButton } from "@/components/shop/CartIncrementTickButton";

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
  if (qty > 0) {
    return (
      <span className="absolute right-2 top-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 shadow-sm">
        In stock
      </span>
    );
  }
  return (
    <span className="absolute right-2 top-2 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 shadow-sm">
      Out of stock
    </span>
  );
}

export const ProductCard = memo(function ProductCard({
  product,
  priority = false,
}: {
  product: ShopProductRow;
  priority?: boolean;
}) {
  const { addToCart } = useCart();
  const priceLabel =
    product.price != null ? `$${product.price}` : "Price on request";
  const unitPrice = product.price ?? "0";
  const imgSrc = product.imageUrl?.trim() || PLACEHOLDER_IMAGE;

  function handleAdd() {
    addToCart({
      productId: product._id,
      name: product.name,
      standardCode: product.standardCode,
      price: unitPrice,
      quantity: 1,
      imageUrl: product.imageUrl ?? null,
    });
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
          priority={priority}
          loading={priority ? undefined : "lazy"}
        />
        <StockBadge qty={product.quantityAvailable} />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-base font-bold text-slate-900">
          {product.name}
        </h3>
        <p className="mt-1 text-xs text-slate-500">{product.standardCode}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-lg font-semibold text-[#2563EB]">{priceLabel}</p>
          <CartIncrementTickButton
            size="md"
            onClick={handleAdd}
            disabled={product.quantityAvailable === 0}
            aria-label="Add to cart"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed disabled:hover:bg-slate-100"
          />
        </div>
      </div>
    </article>
  );
});
