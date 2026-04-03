"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { HeroSearchField } from "./ShopHeader";
import { useCart } from "@/app/(shop)/context/CartContext";
import { useShopSearch } from "./shop-search-context";

type ShopProductRow = {
  _id: string;
  name: string;
  standardCode: string;
  price: string | null;
  quantityAvailable: number;
};

type ProductsResponse = {
  success: boolean;
  data: {
    products: ShopProductRow[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

async function fetchProducts(page: number, search: string): Promise<ProductsResponse> {
  const params = new URLSearchParams({ page: String(page) });
  if (search.trim()) params.set("search", search.trim());
  const res = await fetch(`/api/shop/products?${params.toString()}`);
  if (!res.ok) {
    throw new Error("Failed to load products");
  }
  return res.json() as Promise<ProductsResponse>;
}

function ProductSkeletonCard() {
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

function ProductCard({ product }: { product: ShopProductRow }) {
  const { addToCart } = useCart();
  const [added, setAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceLabel =
    product.price != null ? `$${product.price}` : "Price on request";
  const unitPrice = product.price ?? "0";

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
    });
    setAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAdded(false), 1000);
  }

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        <Image
          src="https://placehold.co/400x300?text=Product"
          alt=""
          fill
          className="object-cover transition duration-300 group-hover:scale-[1.02]"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-base font-bold text-slate-900">
          {product.name}
        </h3>
        <p className="mt-1 text-xs text-slate-500">{product.standardCode}</p>
        <p className="mt-3 text-lg font-semibold text-[#2563EB]">{priceLabel}</p>
        <p className="text-xs text-slate-500">
          {product.quantityAvailable} in stock
        </p>
        <div className="mt-4 overflow-hidden">
          <button
            type="button"
            onClick={handleAdd}
            className={`w-full translate-y-0 rounded-lg py-2.5 text-sm font-semibold text-white transition group-hover:shadow-md ${
              added ? "bg-emerald-600 hover:bg-emerald-600" : "bg-[#2563EB] hover:bg-blue-600"
            }`}
          >
            {added ? "Added!" : "Add to Cart"}
          </button>
        </div>
      </div>
    </article>
  );
}

export function ShopHomeClient() {
  const { debouncedSearch } = useShopSearch();
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ["shop-products", page, debouncedSearch],
    queryFn: () => fetchProducts(page, debouncedSearch),
  });

  const products = data?.data.products ?? [];
  const totalPages = data?.data.totalPages ?? 1;
  const showSkeleton = (isLoading || isFetching) && !data;

  return (
    <>
      <section className="flex min-h-[50vh] flex-col justify-center bg-[#0F172A] px-4 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
          Find Everything You Need.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-300 sm:text-xl">
          Browse thousands of products, build your order, and get a quote
          instantly.
        </p>
        <div className="mt-10">
          <HeroSearchField />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 lg:px-6">
        <h2 className="mb-8 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Popular Products
        </h2>

        {isError ? (
          <p className="text-center text-slate-600">
            Something went wrong while loading products. Please try again.
          </p>
        ) : null}

        {showSkeleton ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ProductSkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <>
            <div
              className={`relative grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 ${
                isFetching && data ? "opacity-70" : ""
              } transition-opacity`}
            >
              {products.map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>
            {products.length === 0 && !showSkeleton ? (
              <p className="py-12 text-center text-slate-600">
                No products match your search.
              </p>
            ) : null}
            {totalPages > 1 ? (
              <div className="mt-10 flex justify-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="flex items-center px-2 text-sm text-slate-600">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
