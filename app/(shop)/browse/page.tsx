import { Suspense } from "react";
import { BrowseClient, BrowseSkeleton } from "@/components/shop/BrowseClient";

interface BrowsePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata = {
  title: "Browse Products — StockFlow Shop",
  description: "Search and filter thousands of products",
};

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const params = await searchParams;

  const initial = {
    q: typeof params.q === "string" ? params.q : "",
    minPrice: typeof params.minPrice === "string" ? params.minPrice : "",
    maxPrice: typeof params.maxPrice === "string" ? params.maxPrice : "",
    minQty: typeof params.minQty === "string" ? params.minQty : "",
    sort: typeof params.sort === "string" ? params.sort : "name_asc",
  };

  return (
    <Suspense fallback={<BrowseSkeleton />}>
      <BrowseClient initialParams={initial} />
    </Suspense>
  );
}
