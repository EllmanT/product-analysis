"use client";

import { useState } from "react";
import { Bot, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StockAgentChat } from "./StockAgentChat";

export function StockAgentWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-blue-700 sm:bottom-6 sm:right-6"
          aria-label="Open stock assistant"
        >
          <Bot className="size-5" />
          <span className="hidden sm:inline">Ask AI</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-0 right-0 z-50 flex w-full flex-col border border-gray-200 bg-white shadow-2xl sm:bottom-4 sm:right-4 sm:w-[380px] sm:max-h-[520px] sm:rounded-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 bg-gray-50">
            <div className="flex items-center gap-2">
              <Bot className="size-5 text-blue-600" />
              <span className="text-sm font-semibold text-gray-900">
                Stock Assistant
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex-1 min-h-0 h-[420px] sm:h-[460px]">
            <StockAgentChat compact showQuickQuestions />
          </div>
        </div>
      )}
    </>
  );
}
