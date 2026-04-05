"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { ShopHomepageProductRow } from "@/types/shop-homepage";

import { useShopHomepageData } from "./homepage-data-provider";
import { ProductCard, ProductSkeletonCard } from "./ProductCard";

function SectionSkeleton() {
  return (
    <div className="mb-14">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-5 w-16 animate-pulse rounded-lg bg-slate-100" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <ProductSkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

function ProductSection({
  title,
  products,
  viewAllHref,
  badge,
}: {
  title: string;
  products: ShopHomepageProductRow[];
  viewAllHref: string;
  badge?: string;
}) {
  if (products.length === 0) return null;

  return (
    <section className="mb-14">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {title}
          </h2>
          {badge && (
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              {badge}
            </span>
          )}
        </div>
        <Link
          href={viewAllHref}
          className="flex items-center gap-1 text-sm font-semibold text-blue-600 transition hover:text-blue-800"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {products.slice(0, 8).map((p) => (
          <ProductCard key={p._id} product={p} />
        ))}
      </div>
    </section>
  );
}

export function HomepageSections() {
  const { data, isLoading, isError } = useShopHomepageData();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-14 lg:px-6">
        <SectionSkeleton />
        <SectionSkeleton />
        <SectionSkeleton />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-14 lg:px-6">
        <p className="text-center text-slate-500">
          Unable to load products right now. Please refresh the page.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-14 lg:px-6">
      {data.featuredText && (
        <div className="mb-10 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-5">
          <p className="text-base font-semibold text-blue-800">
            {data.featuredText}
          </p>
          {data.bannerText && (
            <p className="mt-1 text-sm text-blue-600">{data.bannerText}</p>
          )}
        </div>
      )}

      <ProductSection
        title="Popular Products"
        products={data.popular}
        viewAllHref="/browse?minQty=50&maxPrice=50&sort=qty_desc"
        badge="Best value"
      />

      <ProductSection
        title="Fast Moving"
        products={data.fastMoving}
        viewAllHref="/browse?sort=qty_desc"
        badge="High demand"
      />

      <ProductSection
        title="On Promotion"
        products={data.promotional}
        viewAllHref="/browse"
        badge="Special picks"
      />
    </div>
  );
}
