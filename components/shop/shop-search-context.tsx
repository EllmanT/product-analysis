"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ShopSearchContextValue = {
  search: string;
  setSearch: (value: string) => void;
  debouncedSearch: string;
};

const ShopSearchContext = createContext<ShopSearchContextValue | null>(null);

export function ShopSearchProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const value = useMemo(
    () => ({ search, setSearch, debouncedSearch }),
    [search, debouncedSearch]
  );

  return (
    <ShopSearchContext.Provider value={value}>
      {children}
    </ShopSearchContext.Provider>
  );
}

export function useShopSearch() {
  const ctx = useContext(ShopSearchContext);
  if (!ctx) {
    throw new Error("useShopSearch must be used within ShopSearchProvider");
  }
  return ctx;
}
