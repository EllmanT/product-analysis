"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  DollarSign,
  ImageIcon,
  Layers,
  Loader2,
  Package,
  Search,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

// ─── Types ────────────────────────────────────────────────────────────────────

type Summary = {
  totalProducts: number;
  totalUnits: number;
  totalValue: number;
  deadStock: number;
};

type ProductRow = {
  _id: string;
  name: string;
  standardCode: string;
  totalQty: number;
  price: number;
  stockValue: number;
  status: "In Stock" | "Low Stock" | "Dead Stock";
  lastUploadDate: string | null;
  isActive: boolean;
};

type Filter =
  | "all"
  | "instock"
  | "deadstock"
  | "highvalue"
  | "lowstock"
  | "inactive";

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtCount = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const fmtMoney = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: Summary | null }) {
  const cards = [
    {
      label: "Total Products",
      value: summary ? fmtCount.format(summary.totalProducts) : "—",
      icon: Package,
      accent: "bg-blue-100 text-blue-600",
    },
    {
      label: "Total Units in Stock",
      value: summary ? fmtCount.format(summary.totalUnits) : "—",
      icon: Layers,
      accent: "bg-green-100 text-green-600",
    },
    {
      label: "Total Stock Value",
      value: summary ? fmtMoney.format(summary.totalValue) : "—",
      icon: DollarSign,
      accent: "bg-purple-100 text-purple-600",
    },
    {
      label: "Dead Stock Items",
      value: summary ? fmtCount.format(summary.deadStock) : "—",
      icon: AlertTriangle,
      accent: "bg-red-100 text-red-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, accent }) => (
        <Card key={label} className="shadow-xs">
          <CardHeader className="flex flex-row items-center gap-4 pb-2">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardDescription className="text-xs">{label}</CardDescription>
              <CardTitle className="text-xl font-semibold tabular-nums">
                {value}
              </CardTitle>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: "all", label: "All Products" },
  { key: "instock", label: "In Stock" },
  { key: "deadstock", label: "Dead Stock" },
  { key: "highvalue", label: "High Value" },
  { key: "lowstock", label: "Low Stock" },
  { key: "inactive", label: "Inactive" },
];

function StatusBadge({ status }: { status: ProductRow["status"] }) {
  if (status === "In Stock")
    return (
      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
        In Stock
      </Badge>
    );
  if (status === "Low Stock")
    return (
      <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
        Low Stock
      </Badge>
    );
  return (
    <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
      Dead Stock
    </Badge>
  );
}

function QtyCell({ qty }: { qty: number }) {
  const color =
    qty === 0
      ? "text-red-600 font-semibold"
      : qty < 10
      ? "text-orange-600 font-semibold"
      : "text-green-700 font-semibold";
  return <span className={color}>{fmtCount.format(qty)}</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function ProductsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // debounced
  const [loading, setLoading] = useState(true);
  const [assignImagesLoading, setAssignImagesLoading] = useState(false);
  const [assignImagesMessage, setAssignImagesMessage] = useState<string | null>(
    null
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input → search state
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1); // reset to page 1 on new search
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Reset to page 1 when filter changes
  const handleFilterChange = (f: Filter) => {
    setActiveFilter(f);
    setPage(1);
  };

  // Fetch summary once
  useEffect(() => {
    fetch("/api/admin/products/summary")
      .then((r) => r.json())
      .then(({ data }) => setSummary(data ?? null))
      .catch(console.error);
  }, []);

  // Fetch table data when page / filter / search changes
  const fetchProducts = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
          filter: activeFilter,
          ...(search ? { search } : {}),
        });
        const res = await fetch(`/api/admin/products?${params}`);
        const { data } = await res.json();
        setProducts(
          (data?.products ?? []).map(
            (p: ProductRow & { isActive?: boolean }) => ({
              ...p,
              isActive: p.isActive !== false,
            })
          )
        );
        setTotal(data?.total ?? 0);
        setTotalPages(data?.totalPages ?? 1);
      } catch (err) {
        console.error(err);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [page, activeFilter, search]
  );

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  async function handleIsActiveToggle(id: string, next: boolean) {
    const previous = products;
    setProducts((prev) =>
      prev.map((p) => (p._id === id ? { ...p, isActive: next } : p))
    );
    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      if (!res.ok) {
        setProducts(previous);
        return;
      }
      await fetchProducts({ silent: true });
    } catch {
      setProducts(previous);
    }
  }

  async function handleAssignImages() {
    setAssignImagesMessage(null);
    setAssignImagesLoading(true);
    try {
      const res = await fetch("/api/admin/products/assign-images", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setAssignImagesMessage("Could not assign images. Try again.");
        return;
      }
      const n = json.data?.updated ?? 0;
      setAssignImagesMessage(
        n === 0
          ? "All products already have images assigned."
          : `Assigned images to ${fmtCount.format(n)} product${n === 1 ? "" : "s"}.`
      );
    } catch {
      setAssignImagesMessage("Could not assign images. Try again.");
    } finally {
      setAssignImagesLoading(false);
    }
  }

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex flex-1 flex-col gap-0">
      {/* Header */}
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6 mt-2">
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <h1 className="text-base font-medium">Products</h1>
      </div>

      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        {/* Section 1 – Summary Cards */}
        <SummaryCards summary={summary} />

        <div className="px-4 lg:px-6 flex flex-col gap-4">
          {/* Section 2 – Filter Tabs */}
          <div className="flex flex-wrap gap-2">
            {FILTER_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleFilterChange(key)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeFilter === key
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Section 3 – Search + actions */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by name, code, or &gt;10 / &lt;5 for price…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={assignImagesLoading}
              onClick={() => void handleAssignImages()}
              className="shrink-0 gap-2"
            >
              {assignImagesLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImageIcon className="h-4 w-4" />
              )}
              Assign Product Images
            </Button>
          </div>
          {assignImagesMessage ? (
            <p className="text-sm text-slate-600">{assignImagesMessage}</p>
          ) : null}

          {/* Section 4 – Table */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            {/* Record count */}
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
              <span>
                {total === 0
                  ? "No products found"
                  : `Showing ${fmtCount.format(from)}–${fmtCount.format(to)} of ${fmtCount.format(total)} products`}
              </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Product Code</th>
                    <th className="px-4 py-3">Product Name</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">Qty in Stock</th>
                    <th className="px-4 py-3 text-right">Stock Value</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-center">Active</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                        Loading…
                      </td>
                    </tr>
                  ) : products.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <Package className="h-10 w-10 opacity-30" />
                          <p className="text-sm font-medium">No products match your filters</p>
                          <p className="text-xs">Try adjusting the search or tab filter above</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    products.map((p) => (
                      <tr
                        key={p._id}
                        className="border-b border-slate-50 transition-colors hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-mono font-bold text-slate-800 text-xs">
                          {p.standardCode}
                        </td>
                        <td className="px-4 py-3 text-slate-700 max-w-[260px] truncate">
                          {p.name}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {fmtMoney.format(p.price)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <QtyCell qty={p.totalQty} />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {fmtMoney.format(p.stockValue)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Switch
                            checked={p.isActive}
                            onCheckedChange={(checked) =>
                              void handleIsActiveToggle(p._id, checked)
                            }
                            aria-label={
                              p.isActive ? "Deactivate product" : "Activate product"
                            }
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/products/${p._id}`}>
                            <Button variant="outline" size="sm">
                              View
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-slate-500">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
