"use client";

import type { ProductUploadSummary } from "@/types/upload-summary";
import {
  Activity,
  Building2,
  Calendar,
  Database,
  FileSpreadsheet,
  FileText,
  HardDrive,
  Loader2,
  Package,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";

const PROCESSING_PHRASES = [
  "Reading file…",
  "Parsing product lines…",
  "Resolving product codes…",
  "Updating inventory records…",
  "Reconciling weekly summaries…",
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

  useEffect(() => {
    if (phase !== "processing") return;
    const id = window.setInterval(() => {
      setPhraseIndex((i) => (i + 1) % PROCESSING_PHRASES.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "processing") setPhraseIndex(0);
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
        <h2 className="text-lg font-semibold text-gray-900">Upload results</h2>
      </div>

      {phase === "idle" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <Package className="size-12 opacity-40" />
          <p className="max-w-sm text-sm">
            Choose a branch (if required), select a .txt file, and upload to
            see a live summary here.
          </p>
        </div>
      )}

      {phase === "processing" && (
        <div className="flex flex-1 flex-col gap-6">
          <div className="flex items-center justify-center gap-4 py-4">
            <div className="relative flex size-14 items-center justify-center rounded-full bg-blue-50">
              <Loader2 className="size-7 animate-spin text-blue-600" />
            </div>
            <div className="flex gap-2">
              <Package
                className="size-8 text-amber-500 opacity-90 animate-pulse"
                style={{ animationDelay: "0ms" }}
              />
              <Database className="size-8 text-emerald-600 opacity-90 animate-pulse [animation-delay:200ms]" />
              <Sparkles className="size-8 text-violet-500 opacity-90 animate-pulse [animation-delay:400ms]" />
            </div>
          </div>

          <p
            className="min-h-[1.5rem] text-center text-sm font-medium text-blue-800 transition-all duration-300"
            key={phraseIndex}
          >
            {PROCESSING_PHRASES[phraseIndex]}
          </p>

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
        <div className="flex flex-1 flex-col gap-4">
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
            <StatPill label="Product lines" value={summary.productLineCount} />
            <StatPill label="Total units" value={summary.totalQuantity} />
            <StatPill
              label="Total value"
              value={formatCurrency(summary.totalValue)}
              className="sm:col-span-1"
            />
            <StatPill
              label="Dead stock (SKUs)"
              value={summary.deadStockSkus}
              variant="muted"
            />
            <StatPill
              label="Active stock (SKUs)"
              value={summary.activeStockSkus}
              variant="accent"
            />
          </div>
        </div>
      )}

      {phase === "duplicate" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Activity className="size-10 text-amber-500" />
          <p className="font-medium text-amber-900">Duplicate upload</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {duplicateMessage ??
              "This file was already processed. No changes were made."}
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-1 flex-col gap-3 rounded-lg border border-red-100 bg-red-50/80 p-4 text-sm text-red-900">
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
}: {
  label: string;
  value: string | number;
  className?: string;
  variant?: "default" | "muted" | "accent";
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
      <p className="text-lg font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}
