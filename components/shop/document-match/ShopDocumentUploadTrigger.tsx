"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Paperclip } from "lucide-react";
import { useRef } from "react";

import { useDocumentMatchUpload } from "./DocumentMatchContext";

const ACCEPT = "image/*,.pdf,application/pdf";

type ShopDocumentUploadTriggerProps = {
  className?: string;
  /** Visual style: icon-only (header) or matches hero secondary actions */
  variant?: "icon" | "hero";
};

export function ShopDocumentUploadTrigger({
  className = "",
  variant = "icon",
}: ShopDocumentUploadTriggerProps) {
  const { submitFile, isLoading } = useDocumentMatchUpload();
  const inputRef = useRef<HTMLInputElement>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void submitFile(file);
  }

  const iconBtnClass =
    variant === "hero"
      ? "rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
      : "shrink-0 rounded-full border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50";

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={onChange}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`${iconBtnClass} ${className}`.trim()}
            aria-label="Upload a list or quote (image or PDF)"
            disabled={isLoading}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip className="h-5 w-5" strokeWidth={2} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          Upload a photo or PDF — we&apos;ll match lines to products.
        </TooltipContent>
      </Tooltip>
    </>
  );
}
