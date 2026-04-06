import { Suspense } from "react";
import { BrowseClient, BrowseSkeleton } from "@/components/shop/BrowseClient";
import type { ShopProductRow } from "@/components/shop/ProductCard";

interface BrowsePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata = {
  title: "Browse Products — StockFlow Shop",
  description: "Search and filter thousands of products",
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

async function fetchInitialProducts(params: {
  q: string;
  minPrice: string;
  maxPrice: string;
  minQty: string;
  sort: string;
}): Promise<ProductsResponse | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const p = new URLSearchParams({ page: "1", pageSize: "48" });
    if (params.q) p.set("search", params.q);
    if (params.minPrice) p.set("minPrice", params.minPrice);
    if (params.maxPrice) p.set("maxPrice", params.maxPrice);
    if (params.minQty) p.set("minQty", params.minQty);
    if (params.sort) p.set("sort", params.sort);

    const res = await fetch(`${baseUrl}/api/shop/products?${p.toString()}`, {
      next: { revalidate: 60 },
    });

    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error("Failed to fetch initial products:", error);
    return null;
  }
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const params = await searchParams;

  const initial = {
    q: typeof params.q === "string" ? params.q : "",
    minPrice: typeof params.minPrice === "string" ? params.minPrice : "",
    maxPrice: typeof params.maxPrice === "string" ? params.maxPrice : "",
    minQty: typeof params.minQty === "string" ? params.minQty : "",
    sort: typeof params.sort === "string" ? params.sort : "name_asc",
  };

  const initialData = await fetchInitialProducts(initial);

  return (
    <Suspense fallback={<BrowseSkeleton />}>
      <BrowseClient initialParams={initial} initialData={initialData} />
    </Suspense>
  );
}
