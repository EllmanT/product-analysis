"use client";

import { AnalyticsFilterBar } from "@/components/analytics/AnalyticsFilterBar";
import { AnalyticsLineChart } from "@/components/analytics/AnalyticsLineChart";
import GlobalSearch from "@/components/search/GlobalSearch";
import { Separator } from "@/components/ui/separator";
import { useAnalyticsChartData } from "@/hooks/useAnalyticsChartData";
import { formatDateParam, getDefaultDateRange } from "@/lib/analytics/defaults";
import { Info } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branchId = searchParams.get("branch");
  const productIdParam = searchParams.get("productId");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [storeId, setStoreId] = useState("");
  const [initLoading, setInitLoading] = useState(true);
  const [productName, setProductName] = useState("");
  const [productCode, setProductCode] = useState("");
  const defaultProductSet = useRef(false);

  const {
    filters,
    setStartDate,
    setEndDate,
    setGranularity,
    reset,
    chartData,
    loading: chartLoading,
    fetchChart,
  } = useAnalyticsChartData();

  const selectedBranch = useMemo(
    () => branches.find((b) => b._id === branchId),
    [branchId, branches]
  );

  const loadChart = useCallback(
    (productId: string) => {
      if (!storeId || !productId) return;
      fetchChart({
        storeId,
        scope: "product",
        productId,
        branchId: branchId && branchId !== "all" ? branchId : undefined,
      });
    },
    [storeId, branchId, fetchChart]
  );

  const ensureDefaultProduct = useCallback(async () => {
    if (!storeId || productIdParam || defaultProductSet.current) return;
    defaultProductSet.current = true;

    const { startDate, endDate } = getDefaultDateRange();
    const params = new URLSearchParams({
      storeId,
      startDate: formatDateParam(startDate),
      endDate: formatDateParam(endDate),
    });
    const res = await fetch(`/api/analytics/top-product?${params}`);
    if (!res.ok) return;
    const json = await res.json();
    if (json.data?.productId) {
      setProductName(json.data.name);
      setProductCode(json.data.code);
      const next = new URLSearchParams(searchParams.toString());
      next.set("productId", json.data.productId);
      router.replace(`?${next.toString()}`, { scroll: false });
    }
  }, [storeId, productIdParam, searchParams, router]);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch("/api/branches");
        if (!res.ok) throw new Error("Failed to fetch branches");
        const { data } = await res.json();
        setBranches(data.branches);
        setStoreId(data.branches[0]?.storeId?._id ?? "");
      } catch (err) {
        console.error(err);
      } finally {
        setInitLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!storeId) return;
    const timer = window.setTimeout(() => {
      void ensureDefaultProduct();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storeId, ensureDefaultProduct]);

  useEffect(() => {
    const pid = searchParams.get("productId");
    if (!storeId || !pid) return;

    fetch(`/api/admin/products/${pid}`)
      .then((r) => r.json())
      .then((json) => {
        const p = json?.data?.product;
        if (p?.name) {
          setProductName(p.name);
          setProductCode(p.standardCode ?? "");
        }
      })
      .catch(() => {});

    loadChart(pid);
  }, [storeId, searchParams, loadChart]);

  if (initLoading) return <div className="p-6">Loading product movement…</div>;

  const activeProductId = searchParams.get("productId");

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">Product Movement</h1>
      </div>

      <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900 lg:mx-6">
        <Info className="size-4 mt-0.5 shrink-0" />
        <p>
          Search any product below to see its sales trend across branches. By default
          we show the fastest-moving product from the last 2 months.
        </p>
      </div>

      <div className="flex justify-center w-full mt-4">
        <GlobalSearch />
      </div>

      <AnalyticsFilterBar
        branches={branches}
        filters={filters}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onGranularityChange={setGranularity}
        onApply={() => activeProductId && loadChart(activeProductId)}
        onReset={() => {
          reset();
          defaultProductSet.current = false;
          router.replace(window.location.pathname);
        }}
        loading={chartLoading}
        showMetric={false}
      />

      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-12">
              <AnalyticsLineChart
                data={chartData}
                metric="sales"
                granularity={filters.granularity}
                title={
                  productName
                    ? `Sales trend — ${productName}${productCode ? ` (${productCode})` : ""}`
                    : "Product sales trend"
                }
                description={
                  activeProductId
                    ? "Estimated sales by branch for the selected product"
                    : "Select a product to view movement"
                }
                selectedBranch={selectedBranch}
                loading={chartLoading}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
