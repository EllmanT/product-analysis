"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";

import { ShopSearchProvider } from "./shop-search-context";

export function ShopProviders({ children }: { children: ReactNode }) {
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <ShopSearchProvider>{children}</ShopSearchProvider>
    </QueryClientProvider>
  );
}
