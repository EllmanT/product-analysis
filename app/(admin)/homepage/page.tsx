"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Search, X } from "lucide-react";

type ProductHit = {
  _id: string;
  name: string;
  standardCode: string;
};

type Config = {
  promotionalProductIds: string[];
  featuredText: string;
  bannerText: string;
};

export default function AdminHomepagePage() {
  const [config, setConfig] = useState<Config>({
    promotionalProductIds: [],
    featuredText: "",
    bannerText: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Product search state
  const [productSearch, setProductSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<ProductHit[]>([]);

  useEffect(() => {
    fetch("/api/admin/homepage-config")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          const d = json.data as Config & { promotionalProductIds: unknown[] };
          setConfig({
            featuredText: d.featuredText ?? "",
            bannerText: d.bannerText ?? "",
            promotionalProductIds: (d.promotionalProductIds ?? []).map(String),
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Debounced product search
  useEffect(() => {
    if (!productSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/admin/products?search=${encodeURIComponent(productSearch)}&pageSize=10&page=1`
        );
        const json = await res.json();
        const hits: ProductHit[] = (
          (json?.data?.products as ProductHit[]) ?? []
        ).map((p) => ({
          _id: String(p._id ?? p),
          name: p.name ?? "",
          standardCode: p.standardCode ?? "",
        }));
        setSearchResults(hits);
      } catch {
        //
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [productSearch]);

  function addProduct(product: ProductHit) {
    if (selectedProducts.some((p) => p._id === product._id)) return;
    setSelectedProducts((prev) => [...prev, product]);
    setConfig((c) => ({
      ...c,
      promotionalProductIds: [...c.promotionalProductIds, product._id],
    }));
    setProductSearch("");
    setSearchResults([]);
  }

  function removeProduct(id: string) {
    setSelectedProducts((prev) => prev.filter((p) => p._id !== id));
    setConfig((c) => ({
      ...c,
      promotionalProductIds: c.promotionalProductIds.filter((x) => x !== id),
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/homepage-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          featuredText: config.featuredText,
          bannerText: config.bannerText,
          promotionalProductIds: config.promotionalProductIds,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json?.error?.message ?? "Failed to save.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">
        Homepage Configuration
      </h1>
      <p className="mb-8 text-sm text-slate-500">
        Manage what appears on the shop homepage.
      </p>

      <div className="space-y-8">
        {/* Featured text */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Banner Text
          </h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Featured Headline
              </label>
              <input
                type="text"
                value={config.featuredText}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, featuredText: e.target.value }))
                }
                placeholder="e.g. End-of-season sale on electrical supplies!"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 outline-none ring-blue-500 focus:ring-2"
              />
              <p className="mt-1 text-xs text-slate-400">
                Shown as a highlighted banner above product sections.
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Banner Subtext
              </label>
              <input
                type="text"
                value={config.bannerText}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, bannerText: e.target.value }))
                }
                placeholder="e.g. Up to 30% off selected products this week."
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 outline-none ring-blue-500 focus:ring-2"
              />
            </div>
          </div>
        </div>

        {/* Promotional products */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-slate-900">
            Promotional Products
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Search and pin specific products to the &quot;On Promotion&quot; section. Leave empty to use a random selection.
          </p>

          {/* Product search */}
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products to add..."
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-4 text-slate-900 outline-none ring-blue-500 focus:ring-2"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
            )}
          </div>

          {/* Search results dropdown */}
          {searchResults.length > 0 && (
            <ul className="mb-4 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {searchResults.map((hit) => (
                <li key={hit._id}>
                  <button
                    type="button"
                    onClick={() => addProduct(hit)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{hit.name}</p>
                      <p className="text-xs text-slate-400">{hit.standardCode}</p>
                    </div>
                    <Plus className="h-4 w-4 text-blue-500" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Selected products */}
          {selectedProducts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedProducts.map((p) => (
                <span
                  key={p._id}
                  className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700"
                >
                  {p.name}
                  <button
                    type="button"
                    onClick={() => removeProduct(p._id)}
                    className="rounded-full p-0.5 hover:bg-blue-200"
                    aria-label={`Remove ${p.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">
              No products pinned — a random selection will be shown.
            </p>
          )}
        </div>

        {/* Save */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
          ) : saved ? (
            <><Check className="h-4 w-4" /> Saved!</>
          ) : (
            "Save Changes"
          )}
        </button>
      </div>
    </div>
  );
}
