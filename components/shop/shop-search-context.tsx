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

type HeroVisibilityContextValue = {
  heroVisible: boolean;
  setHeroVisible: (v: boolean) => void;
};

export const HeroVisibilityContext =
  createContext<HeroVisibilityContextValue>({
    heroVisible: true,
    setHeroVisible: () => {},
  });

export function ShopSearchProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [heroVisible, setHeroVisible] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const searchValue = useMemo(
    () => ({ search, setSearch, debouncedSearch }),
    [search, debouncedSearch]
  );

  const heroValue = useMemo(
    () => ({ heroVisible, setHeroVisible }),
    [heroVisible]
  );

  return (
    <ShopSearchContext.Provider value={searchValue}>
      <HeroVisibilityContext.Provider value={heroValue}>
        {children}
      </HeroVisibilityContext.Provider>
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

export function useHeroVisibility() {
  return useContext(HeroVisibilityContext);
}
