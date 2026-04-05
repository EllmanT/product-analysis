"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { ProductCard, ProductSkeletonCard, type ShopProductRow } from "./ProductCard";

type BrowseParams = {
  q: string;
  minPrice: string;
  maxPrice: string;
  minQty: string;
  sort: string;
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

const SORT_OPTIONS = [
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "qty_desc", label: "Most in Stock" },
];

async function fetchBrowseProducts(
  params: BrowseParams & { page: number }
): Promise<ProductsResponse> {
  const p = new URLSearchParams({ page: String(params.page), pageSize: "24" });
  if (params.q) p.set("search", params.q);
  if (params.minPrice) p.set("minPrice", params.minPrice);
  if (params.maxPrice) p.set("maxPrice", params.maxPrice);
  if (params.minQty) p.set("minQty", params.minQty);
  if (params.sort) p.set("sort", params.sort);
  const res = await fetch(`/api/shop/products?${p.toString()}`);
  if (!res.ok) throw new Error("Failed to load products");
  return res.json() as Promise<ProductsResponse>;
}

export function BrowseSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
      <div className="mb-6 h-10 w-64 animate-pulse rounded-xl bg-slate-200" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductSkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

function FilterPanel({
  filters,
  onChange,
  onClear,
}: {
  filters: BrowseParams;
  onChange: (key: keyof BrowseParams, value: string) => void;
  onClear: () => void;
}) {
  const hasFilters =
    filters.q || filters.minPrice || filters.maxPrice || filters.minQty;

  return (
    <aside className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Filters</h2>
        {hasFilters && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            <X className="h-3 w-3" /> Clear all
          </button>
        )}
      </div>

      {/* Search */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-500">
          Name or Code
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={filters.q}
            onChange={(e) => onChange("q", e.target.value)}
            placeholder="Search..."
            className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>
      </div>

      {/* Price range */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-500">
          Price Range ($)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            value={filters.minPrice}
            onChange={(e) => onChange("minPrice", e.target.value)}
            placeholder="Min"
            className="w-full rounded-lg border border-slate-200 py-2 px-3 text-sm outline-none ring-blue-500 focus:ring-2"
          />
          <input
            type="number"
            min={0}
            value={filters.maxPrice}
            onChange={(e) => onChange("maxPrice", e.target.value)}
            placeholder="Max"
            className="w-full rounded-lg border border-slate-200 py-2 px-3 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>
      </div>

      {/* Min qty */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-500">
          Min. Quantity in Stock
        </label>
        <input
          type="number"
          min={0}
          value={filters.minQty}
          onChange={(e) => onChange("minQty", e.target.value)}
          placeholder="e.g. 10"
          className="w-full rounded-lg border border-slate-200 py-2 px-3 text-sm outline-none ring-blue-500 focus:ring-2"
        />
      </div>

      {/* Sort */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-500">
          Sort By
        </label>
        <select
          value={filters.sort}
          onChange={(e) => onChange("sort", e.target.value)}
          className="w-full rounded-lg border border-slate-200 py-2 px-3 text-sm outline-none ring-blue-500 focus:ring-2"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </aside>
  );
}

export function BrowseClient({
  initialParams,
}: {
  initialParams: BrowseParams;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Derive live filters from URL (searchParams is the source of truth)
  const filtersFromUrl: BrowseParams = {
    q: searchParams.get("q") ?? initialParams.q,
    minPrice: searchParams.get("minPrice") ?? initialParams.minPrice,
    maxPrice: searchParams.get("maxPrice") ?? initialParams.maxPrice,
    minQty: searchParams.get("minQty") ?? initialParams.minQty,
    sort: searchParams.get("sort") ?? initialParams.sort,
  };

  const [filters, setFilters] = useState<BrowseParams>(filtersFromUrl);
  const [page, setPage] = useState(1);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Debounce URL updates
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushToUrl = useCallback(
    (f: BrowseParams) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const p = new URLSearchParams();
        if (f.q) p.set("q", f.q);
        if (f.minPrice) p.set("minPrice", f.minPrice);
        if (f.maxPrice) p.set("maxPrice", f.maxPrice);
        if (f.minQty) p.set("minQty", f.minQty);
        if (f.sort && f.sort !== "name_asc") p.set("sort", f.sort);
        router.replace(`/browse${p.toString() ? `?${p.toString()}` : ""}`, {
          scroll: false,
        });
      }, 300);
    },
    [router]
  );

  function handleFilterChange(key: keyof BrowseParams, value: string) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    setPage(1);
    pushToUrl(next);
  }

  function handleClear() {
    const empty: BrowseParams = {
      q: "",
      minPrice: "",
      maxPrice: "",
      minQty: "",
      sort: "name_asc",
    };
    setFilters(empty);
    setPage(1);
    router.replace("/browse", { scroll: false });
  }

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ["browse-products", filters, page],
    queryFn: () => fetchBrowseProducts({ ...filters, page }),
    placeholderData: (prev) => prev,
  });

  const products = data?.data.products ?? [];
  const total = data?.data.total ?? 0;
  const totalPages = data?.data.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Browse Products
          </h1>
          {!isLoading && (
            <p className="mt-1 text-sm text-slate-500">
              {total.toLocaleString()} product{total !== 1 ? "s" : ""} found
            </p>
          )}
        </div>

        {/* Mobile filter toggle */}
        <button
          type="button"
          onClick={() => setMobileFilterOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm lg:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </button>
      </div>

      <div className="flex gap-8">
        {/* Desktop sidebar */}
        <div className="hidden w-56 shrink-0 lg:block">
          <FilterPanel
            filters={filters}
            onChange={handleFilterChange}
            onClear={handleClear}
          />
        </div>

        {/* Product grid */}
        <div className="min-w-0 flex-1">
          {isError ? (
            <p className="py-12 text-center text-slate-500">
              Something went wrong. Please try again.
            </p>
          ) : isLoading ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <ProductSkeletonCard key={i} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <Search className="h-10 w-10 text-slate-200" />
              <p className="text-slate-500">No products match your filters.</p>
              <button
                type="button"
                onClick={handleClear}
                className="mt-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <>
              <div
                className={`grid grid-cols-2 gap-4 transition-opacity lg:grid-cols-3 xl:grid-cols-4 ${
                  isFetching ? "opacity-70" : ""
                }`}
              >
                {products.map((p) => (
                  <ProductCard key={p._id} product={p} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="px-3 text-sm text-slate-600">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile filter sheet */}
      {mobileFilterOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/40"
            onClick={() => setMobileFilterOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[70] max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Filter Products
              </h3>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <FilterPanel
              filters={filters}
              onChange={(k, v) => {
                handleFilterChange(k, v);
              }}
              onClear={() => {
                handleClear();
                setMobileFilterOpen(false);
              }}
            />
            <button
              type="button"
              onClick={() => setMobileFilterOpen(false)}
              className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white"
            >
              Show Results
            </button>
          </div>
        </>
      )}
    </div>
  );
}
