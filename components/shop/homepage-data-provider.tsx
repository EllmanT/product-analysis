"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";

import type { ShopHomepageData } from "@/types/shop-homepage";

async function fetchShopHomepage(): Promise<ShopHomepageData> {
  const res = await fetch("/api/shop/homepage-sections");
  if (!res.ok) throw new Error("Failed to load homepage sections");
  const json = (await res.json()) as {
    success: boolean;
    data: ShopHomepageData;
  };
  return json.data;
}

type HomepageDataContextValue = {
  data: ShopHomepageData | undefined;
  isLoading: boolean;
  isError: boolean;
};

const HomepageDataContext = createContext<HomepageDataContextValue | null>(
  null
);

export function HomepageDataProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["homepage-sections"],
    queryFn: fetchShopHomepage,
    staleTime: 120_000,
  });

  return (
    <HomepageDataContext.Provider
      value={{
        data: query.data,
        isLoading: query.isLoading,
        isError: query.isError,
      }}
    >
      {children}
    </HomepageDataContext.Provider>
  );
}

export function useShopHomepageData() {
  const ctx = useContext(HomepageDataContext);
  if (!ctx) {
    throw new Error(
      "useShopHomepageData must be used within HomepageDataProvider"
    );
  }
  return ctx;
}
