"use client";

import { MessageCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { StockAgentChat } from "@/components/ai/StockAgentChat";

export default function AiAgentPage() {
  return (
    <div className="flex flex-1 flex-col h-full">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6 justify-between">
        <div className="flex items-center gap-2 mt-2">
          <Separator
            orientation="vertical"
            className="mx-2 data-[orientation=vertical]:h-4"
          />
          <MessageCircle className="size-4 text-blue-600" />
          <h1 className="text-base font-medium">Ask AI</h1>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 lg:px-6 py-4 min-h-0">
        <StockAgentChat />
      </div>
    </div>
  );
}
