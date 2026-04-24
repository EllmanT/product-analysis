"use client";

import { Mic, Plus, Search } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCompactNumber } from "@/lib/utils/formatCompactNumber";
import type { ShopHomepageBrowseTile } from "@/types/shop-homepage";

import { useDocumentMatchUpload } from "./document-match/DocumentMatchContext";
import { useShopHomepageData } from "./homepage-data-provider";
import { HeroVisibilityContext } from "./shop-search-context";

const PLACEHOLDERS = [
  "cables under $20",
  "solar panels in stock",
  "water pumps",
  "LED lights under $10",
  "electrical conduits",
  "circuit breakers",
  "PVC pipes & fittings",
  "power tools",
  "safety equipment",
  "switch sockets",
];

const VISIT_SESSION_KEY = "shop_visit_recorded";

/** Minimal typing for browser speech APIs (DOM `SpeechRecognition` is not always in TS lib). */
type ShopSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:
    | ((
        event: {
          results: ArrayLike<{ 0?: { transcript?: string } }>;
        }
      ) => void)
    | null;
  onerror: (() => void) | null;
  start(): void;
};

function getSpeechRecognitionCtor(): (new () => ShopSpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => ShopSpeechRecognition;
    webkitSpeechRecognition?: new () => ShopSpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function HeroSection() {
  const router = useRouter();
  const { setHeroVisible } = useContext(HeroVisibilityContext);
  const { data, isLoading, isError } = useShopHomepageData();
  const { submitFile, isLoading: documentLoading } = useDocumentMatchUpload();

  const [value, setValue] = useState("");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 3500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(VISIT_SESSION_KEY)) return;
    sessionStorage.setItem(VISIT_SESSION_KEY, "1");
    void fetch("/api/shop/stats/visit", { method: "POST" });
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { threshold: 0, rootMargin: "-64px 0px 0px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [setHeroVisible]);

  function submitSearch() {
    const q = value.trim();
    router.push(q ? `/browse?q=${encodeURIComponent(q)}` : "/browse");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitSearch();
  }

  function startVoiceSearch() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      toast.message("Voice search isn’t available in this browser.");
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        const text = event.results[0]?.[0]?.transcript?.trim();
        if (text) setValue((prev) => (prev ? `${prev} ${text}` : text));
      };
      rec.onerror = () => {
        toast.error("Could not use the microphone.");
      };
      rec.start();
    } catch {
      toast.message("Voice search couldn’t start.");
    }
  }

  function handleProductFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void submitFile(file);
  }

  const browseTiles = data?.browseTiles ?? [];
  const totalProducts = data?.totalListedProducts;
  const totalVisits = data?.totalVisits;

  return (
    <section className="relative flex min-h-[calc(100svh-4rem)] flex-col overflow-hidden bg-[#F8FAFC] px-4 pb-10 pt-20 sm:pb-14 sm:pt-24">
      {/* Stripe-style blurred orbs */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-violet-200/40 blur-3xl" />
        <div className="absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-slate-200/40 blur-3xl" />
        <div className="absolute -right-16 bottom-20 h-80 w-80 rounded-full bg-cyan-200/30 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-indigo-100/50 blur-3xl" />
      </div>

      <div className="relative z-[1] mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center">
        <span className="mb-3 inline-flex items-center gap-1.5 self-center rounded-full border border-slate-200/80 bg-white/70 px-3 py-1 text-xs font-medium text-slate-600 backdrop-blur-sm sm:mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Thousands of products in stock
        </span>

        <h1 className="text-center text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
          Find everything{" "}
          <span className="text-blue-600">you need, fast.</span>
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-slate-500 sm:mt-3 sm:text-base lg:text-lg">
          Browse products, build your order, and get a quote instantly.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mx-auto mt-6 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-md shadow-slate-200/35 backdrop-blur-sm sm:mt-8 sm:rounded-3xl"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,application/pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={handleProductFileChange}
          />

          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 sm:gap-x-3 sm:px-5 sm:py-3.5">
            <span className="shrink-0 text-base font-medium text-slate-800">
              I&apos;m looking for
            </span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              spellCheck={false}
              className="min-w-0 flex-1 border-0 bg-transparent py-0.5 text-base text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:ring-0 sm:min-w-[12ch]"
              placeholder={
                value
                  ? "Refine or edit your search…"
                  : PLACEHOLDERS[placeholderIdx]
              }
              aria-label="Search products"
            />
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-5 sm:py-2.5">
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={startVoiceSearch}
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                    aria-label="Voice search"
                  >
                    <Mic className="h-5 w-5" strokeWidth={2} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  Speak to search for products.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={documentLoading}
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
                    aria-label="Upload product photo or PDF"
                  >
                    <Plus className="h-5 w-5" strokeWidth={2} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  Upload a list or quote — we&apos;ll match lines to products.
                </TooltipContent>
              </Tooltip>
            </div>
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200/90 bg-slate-200/90 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm shadow-slate-300/25 transition hover:border-slate-300/90 hover:bg-slate-300/85 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 active:scale-[0.98] sm:px-5 sm:py-2.5"
            >
              <Search className="h-4 w-4 text-slate-600" strokeWidth={2} />
              Search
            </button>
          </div>
        </form>

        <div className="mx-auto mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center sm:mt-5">
          {isLoading ? (
            <>
              <div className="h-4 w-24 animate-pulse rounded bg-slate-200/80" />
              <div className="h-4 w-28 animate-pulse rounded bg-slate-200/80" />
            </>
          ) : isError ? (
            <p className="text-sm text-slate-500">Live stats unavailable</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                <span className="font-semibold tabular-nums text-slate-900">
                  {formatCompactNumber(totalProducts ?? 0)}
                </span>{" "}
                <span className="text-slate-500">products listed</span>
              </p>
              <span className="hidden text-slate-300 sm:inline" aria-hidden>
                |
              </span>
              <p className="text-sm text-slate-600">
                <span className="font-semibold tabular-nums text-slate-900">
                  {formatCompactNumber(totalVisits ?? 0)}
                </span>{" "}
                <span className="text-slate-500">site visits</span>
              </p>
            </>
          )}
        </div>

        {(isLoading || (!isError && browseTiles.length > 0)) && (
          <div className="mt-6 w-full sm:mt-8">
            <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
              Popular categories
            </p>
            <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:thin] sm:mx-0 sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0">
              {isLoading
                ? Array.from({ length: 8 }, (_, i) => (
                    <div
                      key={`sk-${i}`}
                      className="flex shrink-0 flex-col items-center gap-2"
                    >
                      <div className="h-14 w-14 animate-pulse rounded-full bg-slate-200/90 sm:h-16 sm:w-16" />
                      <div className="h-3 w-14 animate-pulse rounded bg-slate-200/80" />
                    </div>
                  ))
                : browseTiles.map((tile: ShopHomepageBrowseTile) => (
                    <button
                      key={tile.label}
                      type="button"
                      onClick={() =>
                        router.push(
                          `/browse?q=${encodeURIComponent(tile.query)}`
                        )
                      }
                      className="flex shrink-0 flex-col items-center gap-2 rounded-lg p-1 transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                    >
                      <span className="relative h-14 w-14 overflow-hidden rounded-full bg-slate-100 shadow-md ring-2 ring-white sm:h-16 sm:w-16">
                        <Image
                          src={tile.imageUrl}
                          alt={tile.label}
                          fill
                          className="object-cover"
                          sizes="64px"
                          unoptimized
                        />
                      </span>
                      <span className="max-w-[4.5rem] text-center text-xs font-medium text-slate-700">
                        {tile.label}
                      </span>
                    </button>
                  ))}
            </div>
          </div>
        )}
      </div>

      <div ref={sentinelRef} aria-hidden className="h-px w-full shrink-0" />
    </section>
  );
}
