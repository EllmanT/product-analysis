"use client";

import type { ProductUploadSummary } from "@/types/upload-summary";
import {
  Activity,
  BarChart3,
  Building2,
  Calendar,
  Database,
  FileSpreadsheet,
  FileText,
  HardDrive,
  Package,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";

const PROCESSING_PHRASES = [
  "Reading your stock file…",
  "Parsing product lines…",
  "Resolving product codes…",
  "Checking the product catalogue…",
  "Updating inventory records…",
  "Reconciling weekly summaries…",
  "Crunching the numbers…",
  "Almost there…",
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatUploadDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export type UploadResultsPhase =
  | "idle"
  | "processing"
  | "success"
  | "duplicate"
  | "error";

type UploadResultsCardProps = {
  phase: UploadResultsPhase;
  /** Shown while processing (and as fallback before server summary). */
  pendingMeta?: {
    fileName: string;
    fileSizeBytes: number;
    branchLabel: string;
  } | null;
  summary?: ProductUploadSummary | null;
  duplicateMessage?: string;
  errorMessage?: string;
  errorDetails?: Record<string, string[]>;
};

export function UploadResultsCard({
  phase,
  pendingMeta,
  summary,
  duplicateMessage,
  errorMessage,
  errorDetails,
}: UploadResultsCardProps) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [iconPhase, setIconPhase] = useState(0); // 0-3 cycling
  const [progress, setProgress] = useState(0);   // 0-100 fake progress

  useEffect(() => {
    if (phase !== "processing") return;
    const id = window.setInterval(() => {
      setPhraseIndex((i) => (i + 1) % PROCESSING_PHRASES.length);
    }, 1800);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "processing") setPhraseIndex(0);
  }, [phase]);

  // Icon baton-pass animation
  useEffect(() => {
    if (phase !== "processing") { setIconPhase(0); return; }
    const id = window.setInterval(() => setIconPhase(p => (p + 1) % 4), 1400);
    return () => window.clearInterval(id);
  }, [phase]);

  // Time-based progress: linear 0→85% over 12s, slow crawl after, never stalls
  useEffect(() => {
    if (phase !== "processing") {
      if (phase !== "success" && phase !== "error") setProgress(0);
      return;
    }
    const startTime = Date.now();
    const ESTIMATED_MS = 12_000;
    const id = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const linear = Math.min(85, (elapsed / ESTIMATED_MS) * 85);
      const crawl = elapsed > ESTIMATED_MS ? ((elapsed - ESTIMATED_MS) / 1000) * 0.4 : 0;
      setProgress(Math.min(96, linear + crawl));
    }, 250);
    return () => window.clearInterval(id);
  }, [phase]);

  // When success/error, jump progress to 100
  useEffect(() => {
    if (phase === "success" || phase === "error") setProgress(100);
  }, [phase]);

  const displayMeta =
    summary != null
      ? {
          fileName: summary.originalFileName,
          fileSizeBytes: summary.fileSizeBytes,
          branchLabel: `${summary.branch.name}${
            summary.branch.location ? ` — ${summary.branch.location}` : ""
          }`,
          uploadDate: summary.uploadDate,
        }
      : pendingMeta != null
        ? {
            fileName: pendingMeta.fileName,
            fileSizeBytes: pendingMeta.fileSizeBytes,
            branchLabel: pendingMeta.branchLabel,
            uploadDate: null as string | null,
          }
        : null;

  return (
    <div className="flex min-h-[320px] flex-1 flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
      <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
        <FileSpreadsheet className="size-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-900">Upload Summary</h2>
      </div>

      {phase === "idle" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <Package className="size-12 opacity-40" />
          <p className="max-w-sm text-sm">
            Select your stock file and click <strong>Upload Stock File</strong> — your results will appear here.
          </p>
        </div>
      )}

      {phase === "processing" && (
        <div className="flex flex-1 flex-col gap-5">
          {/* Progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500 transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Icon row — sequential spotlight animation */}
          <div className="flex items-center justify-center gap-5 py-2">
            {[
              {
                Icon: Package,
                label: "Parsing",
                color: "text-amber-500",
                activeStyle: { transform: "translateY(-6px) scale(1.25)" },
              },
              {
                Icon: Database,
                label: "Storing",
                color: "text-emerald-600",
                activeStyle: { transform: "rotate(180deg) scale(1.2)" },
              },
              {
                Icon: Sparkles,
                label: "Analysing",
                color: "text-violet-500",
                activeStyle: { transform: "scale(1.3)", filter: "drop-shadow(0 0 8px rgb(139 92 246 / 0.8))" },
              },
              {
                Icon: BarChart3,
                label: "Summarising",
                color: "text-blue-500",
                activeStyle: { transform: "scale(1.2)", filter: "drop-shadow(0 0 6px rgb(59 130 246 / 0.7))" },
              },
            ].map(({ Icon, label, color, activeStyle }, idx) => {
              const isActive = iconPhase === idx;
              return (
                <div key={label} className="flex flex-col items-center gap-1.5">
                  <Icon
                    className={`size-8 transition-all duration-700 ease-in-out ${color}`}
                    style={isActive ? activeStyle : { transform: "scale(0.85)", opacity: 0.35 }}
                  />
                  <span
                    className={`text-[10px] font-medium transition-all duration-500 ${isActive ? "text-gray-700 opacity-100" : "text-gray-400 opacity-60"}`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Cycling phrase */}
          <p
            key={phraseIndex}
            className="min-h-[1.5rem] text-center text-sm font-medium text-blue-800 transition-opacity duration-300"
          >
            {PROCESSING_PHRASES[phraseIndex]}
          </p>

          {/* File meta */}
          {displayMeta && (
            <ul className="mx-auto w-full max-w-md space-y-2 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <FileText className="mt-0.5 size-4 shrink-0 text-gray-500" />
                <span className="break-all">{displayMeta.fileName}</span>
              </li>
              <li className="flex items-center gap-2">
                <HardDrive className="size-4 shrink-0 text-gray-500" />
                {formatFileSize(displayMeta.fileSizeBytes)}
              </li>
              <li className="flex items-start gap-2">
                <Building2 className="mt-0.5 size-4 shrink-0 text-gray-500" />
                {displayMeta.branchLabel}
              </li>
            </ul>
          )}
        </div>
      )}

      {phase === "success" && summary && (
        <div data-testid="upload-success" className="flex flex-1 flex-col gap-4">
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-emerald-800">
            <span className="text-xl">✓</span>
            <p className="font-semibold">Stock file uploaded successfully!</p>
          </div>
          <div className="grid gap-2 rounded-lg bg-gray-50 p-4 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <FileText className="size-4 shrink-0" />
              <span className="break-all font-medium text-gray-900">
                {summary.originalFileName}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-600">
              <span className="inline-flex items-center gap-1">
                <HardDrive className="size-3.5" />
                {formatFileSize(summary.fileSizeBytes)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3.5" />
                {formatUploadDate(summary.uploadDate)}
              </span>
            </div>
            <div className="flex items-start gap-2 border-t border-gray-200 pt-2 text-gray-700">
              <Building2 className="mt-0.5 size-4 shrink-0 text-blue-600" />
              <div>
                <p className="font-medium text-gray-900">{summary.branch.name}</p>
                {summary.branch.location ? (
                  <p className="text-xs text-muted-foreground">
                    {summary.branch.location}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatPill label="Stock Entries" value={summary.productLineCount} testId="stat-product-line-count" />
            <StatPill label="Total Units" value={summary.totalQuantity} />
            <StatPill
              label="Stock Value"
              value={formatCurrency(summary.totalValue)}
              className="sm:col-span-1"
            />
            <StatPill
              label="Out of Stock"
              value={summary.deadStockSkus}
              variant="muted"
              testId="stat-dead-stock"
            />
            <StatPill
              label="Active Stock"
              value={summary.activeStockSkus}
              variant="accent"
            />
          </div>
        </div>
      )}

      {phase === "duplicate" && (
        <div data-testid="upload-duplicate" className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Activity className="size-10 text-amber-500" />
          <p className="font-medium text-amber-900">Duplicate upload</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {duplicateMessage ??
              "This file was already processed. No changes were made."}
          </p>
        </div>
      )}

      {phase === "error" && (
        <div data-testid="upload-error" className="flex flex-1 flex-col gap-3 rounded-lg border border-red-100 bg-red-50/80 p-4 text-sm text-red-900">
          <p className="font-medium">Upload failed</p>
          <p>{errorMessage ?? "Something went wrong."}</p>
          {errorDetails && Object.keys(errorDetails).length > 0 && (
            <ul className="list-inside list-disc text-xs">
              {Object.entries(errorDetails).map(([key, msgs]) => (
                <li key={key}>
                  {key}: {msgs.join(", ")}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function StatPill({
  label,
  value,
  className = "",
  variant = "default",
  testId,
}: {
  label: string;
  value: string | number;
  className?: string;
  variant?: "default" | "muted" | "accent";
  testId?: string;
}) {
  const bg =
    variant === "muted"
      ? "bg-orange-50 border-orange-100"
      : variant === "accent"
        ? "bg-emerald-50 border-emerald-100"
        : "bg-slate-50 border-slate-100";
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${bg} ${className}`}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p data-testid={testId} className="text-lg font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}
