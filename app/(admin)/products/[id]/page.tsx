"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ArrowLeft, Package } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type HistoryRow = {
  _id: string;
  qty: number;
  price: number;
  upload_date: string;
  week: number;
  year: number;
  month: string;
  branchName: string | null;
};

type ProductDetail = {
  product: { _id: string; name: string; standardCode: string };
  currentQty: number;
  currentPrice: number;
  lastUploadDate: string | null;
  history: HistoryRow[];
};

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtMoney = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusFor(qty: number): "In Stock" | "Low Stock" | "Dead Stock" {
  if (qty === 0) return "Dead Stock";
  if (qty < 10) return "Low Stock";
  return "In Stock";
}

function StatusBadge({ qty }: { qty: number }) {
  const status = statusFor(qty);
  if (status === "In Stock")
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">In Stock</Badge>;
  if (status === "Low Stock")
    return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">Low Stock</Badge>;
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Dead Stock</Badge>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/products/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((body) => {
        if (body?.data) setDetail(body.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-slate-400">
        Loading…
      </div>
    );
  }

  if (notFound || !detail) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-slate-400">
        <AlertTriangle className="h-10 w-10 opacity-40" />
        <p className="font-medium">Product not found</p>
        <Link href="/products" className="text-sm text-blue-600 hover:underline">
          Back to Products
        </Link>
      </div>
    );
  }

  const { product, currentQty, currentPrice, lastUploadDate, history } = detail;
  const stockValue = currentQty * currentPrice;

  // Chart: quantity over time (most recent 20 uploads, oldest first for left-to-right trend)
  const chartData = [...history]
    .slice(0, 20)
    .reverse()
    .map((h) => ({
      label: `W${h.week}/${String(h.year).slice(2)}`,
      qty: h.qty,
    }));

  return (
    <div className="flex flex-1 flex-col gap-0">
      {/* Header / Breadcrumb */}
      <div className="flex w-full items-center gap-2 px-4 lg:px-6 mt-2">
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <Link
          href="/products"
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-3 w-3" />
          Products
        </Link>
        <span className="text-xs text-slate-400">/</span>
        <span className="text-xs font-medium text-slate-700 truncate max-w-[200px]">
          {product.name}
        </span>
      </div>

      <div className="flex flex-col gap-4 py-4 px-4 lg:px-6 md:gap-6 md:py-6">
        {/* Section 1 – Header card */}
        <Card className="shadow-xs">
          <CardHeader className="flex flex-row items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <Package className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-sm font-bold text-slate-800">
                  {product.standardCode}
                </code>
                <StatusBadge qty={currentQty} />
              </div>
              <CardTitle className="mt-1 text-xl font-bold text-slate-900">
                {product.name}
              </CardTitle>
            </div>
          </CardHeader>
        </Card>

        {/* Section 2 – Details grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Unit Price", value: fmtMoney.format(currentPrice) },
            { label: "Current Qty", value: currentQty.toLocaleString() },
            { label: "Stock Value", value: fmtMoney.format(stockValue) },
            { label: "Last Upload", value: fmtDate(lastUploadDate) },
          ].map(({ label, value }) => (
            <Card key={label} className="shadow-xs">
              <CardHeader className="pb-1">
                <CardDescription className="text-xs">{label}</CardDescription>
                <CardTitle className="text-lg font-semibold tabular-nums">{value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        {/* Section 3 – Quantity trend chart */}
        {chartData.length > 1 && (
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-slate-700">
                Quantity Trend (last {chartData.length} uploads)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={40} />
                  <Tooltip
                    formatter={(v: number) => [v.toLocaleString(), "Qty"]}
                    labelStyle={{ fontSize: 12 }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar
                    dataKey="qty"
                    fill="#3b82f6"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Section 4 – Upload history table */}
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700">
              Upload History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {history.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
                <Package className="h-8 w-8 opacity-30" />
                <p className="text-sm">No upload history yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3">Upload Date</th>
                      <th className="px-4 py-3">Branch</th>
                      <th className="px-4 py-3 text-right">Quantity</th>
                      <th className="px-4 py-3 text-right">Price</th>
                      <th className="px-4 py-3 text-right">Week</th>
                      <th className="px-4 py-3 text-right">Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr
                        key={h._id}
                        className="border-b border-slate-50 transition-colors hover:bg-slate-50"
                      >
                        <td className="px-4 py-2 text-slate-700 text-xs">
                          {fmtDate(h.upload_date)}
                        </td>
                        <td className="px-4 py-2 text-slate-600 text-xs">
                          {h.branchName ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          <span
                            className={
                              h.qty === 0
                                ? "text-red-600 font-semibold"
                                : h.qty < 10
                                ? "text-orange-600 font-semibold"
                                : "text-green-700 font-semibold"
                            }
                          >
                            {h.qty.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-700 text-xs">
                          {fmtMoney.format(h.price)}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-500 text-xs">
                          W{h.week}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-500 text-xs">
                          {h.year}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
