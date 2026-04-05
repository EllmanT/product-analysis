"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "stockflow-shop-cart";

export type CartLine = {
  productId: string;
  name: string;
  standardCode: string;
  price: string;
  quantity: number;
  imageUrl?: string | null;
};

type CartContextValue = {
  items: CartLine[];
  itemCount: number;
  addToCart: (item: Omit<CartLine, "quantity"> & { quantity?: number }) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function loadFromStorage(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is CartLine =>
        row &&
        typeof row === "object" &&
        typeof (row as CartLine).productId === "string" &&
        typeof (row as CartLine).name === "string" &&
        typeof (row as CartLine).standardCode === "string" &&
        typeof (row as CartLine).price === "string" &&
        typeof (row as CartLine).quantity === "number" &&
        (row as CartLine).quantity > 0
    );
  } catch {
    return [];
  }
}

function persist(items: CartLine[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(loadFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) persist(items);
  }, [items, hydrated]);

  const addToCart = useCallback(
    (item: Omit<CartLine, "quantity"> & { quantity?: number }) => {
      const qty = Math.max(1, item.quantity ?? 1);
      setItems((prev) => {
        const i = prev.findIndex((l) => l.productId === item.productId);
        if (i === -1) {
          return [
            ...prev,
            {
              productId: item.productId,
              name: item.name,
              standardCode: item.standardCode,
              price: item.price,
              quantity: qty,
              imageUrl: item.imageUrl ?? null,
            },
          ];
        }
        const next = [...prev];
        next[i] = { ...next[i], quantity: next[i].quantity + qty };
        return next;
      });
    },
    []
  );

  const removeFromCart = useCallback((productId: string) => {
    setItems((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    const q = Math.floor(quantity);
    if (q < 1) {
      setItems((prev) => prev.filter((l) => l.productId !== productId));
      return;
    }
    setItems((prev) =>
      prev.map((l) =>
        l.productId === productId ? { ...l, quantity: q } : l
      )
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const itemCount = useMemo(
    () => items.reduce((sum, l) => sum + l.quantity, 0),
    [items]
  );

  const value = useMemo(
    () => ({
      items,
      itemCount,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
    }),
    [items, itemCount, addToCart, removeFromCart, updateQuantity, clearCart]
  );

  return (
    <CartContext.Provider value={value}>{children}</CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within CartProvider");
  }
  return ctx;
}
