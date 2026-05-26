"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const QUICK_QUESTIONS_FULL = [
  "What products are running low?",
  "Which branch uploaded most recently?",
  "Show me the top 10 fast-moving products",
  "Which products have zero quantity?",
  "What is the total stock value?",
];

const QUICK_QUESTIONS_COMPACT = [
  "What products are running low?",
  "Which products have zero quantity?",
  "What is the total stock value?",
];

type Props = {
  compact?: boolean;
  showQuickQuestions?: boolean;
};

export function StockAgentChat({
  compact = false,
  showQuickQuestions = true,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const quickQuestions = compact
    ? QUICK_QUESTIONS_COMPACT
    : QUICK_QUESTIONS_FULL;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (question: string) => {
    if (!question.trim() || loading) return;

    const userMessage: Message = { role: "user", content: question };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const data = await res.json();
      const answer =
        data.answer ?? "Sorry, I could not get a response. Please try again.";

      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Something went wrong. Please check your connection and try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div
      className={`flex flex-col ${compact ? "h-full min-h-0" : "flex-1 lg:flex-row gap-4 min-h-0"}`}
    >
      <div
        className={`flex flex-1 flex-col overflow-hidden bg-white ${
          compact
            ? "h-full"
            : "rounded-xl border border-gray-200 shadow-sm"
        }`}
      >
        <div
          className={`flex-1 overflow-y-auto space-y-3 ${compact ? "p-3" : "p-4 space-y-4"}`}
        >
          {messages.length === 0 && (
            <div
              className={`flex flex-col items-center justify-center text-center text-muted-foreground ${
                compact ? "py-8" : "h-full py-16"
              }`}
            >
              <Bot className={`opacity-30 mb-2 ${compact ? "size-8" : "size-12"}`} />
              <p className={`font-medium ${compact ? "text-xs" : "text-sm"}`}>
                Ask a question about your stock
              </p>
              {!compact && (
                <p className="text-xs mt-1">
                  Try one of the quick questions, or type your own.
                </p>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"} ${compact ? "gap-2" : "gap-3"}`}
            >
              <div
                className={`flex shrink-0 items-center justify-center rounded-full text-white ${
                  compact ? "h-6 w-6" : "h-8 w-8"
                } ${msg.role === "user" ? "bg-blue-600" : "bg-gray-600"}`}
              >
                {msg.role === "user" ? (
                  <User className={compact ? "size-3" : "size-4"} />
                ) : (
                  <Bot className={compact ? "size-3" : "size-4"} />
                )}
              </div>
              <div
                data-testid={msg.role === "assistant" ? "ai-response" : undefined}
                className={`max-w-[85%] rounded-2xl leading-relaxed whitespace-pre-wrap ${
                  compact ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm"
                } ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-900"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2 flex-row">
              <div
                className={`flex shrink-0 items-center justify-center rounded-full bg-gray-600 text-white ${
                  compact ? "h-6 w-6" : "h-8 w-8"
                }`}
              >
                <Bot className={compact ? "size-3" : "size-4"} />
              </div>
              <div
                className={`rounded-2xl bg-gray-100 text-gray-500 ${
                  compact ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm"
                }`}
              >
                Thinking…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className={`border-t border-gray-100 ${compact ? "p-2" : "p-3"}`}>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              data-testid="ai-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your stock…"
              disabled={loading}
              className={`flex-1 rounded-xl border border-gray-200 bg-gray-50 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 disabled:opacity-50 ${
                compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
              }`}
            />
            <Button
              data-testid="ai-send"
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-blue-600 text-white hover:bg-blue-700 rounded-xl shrink-0"
              size={compact ? "sm" : "sm"}
            >
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </div>

      {showQuickQuestions && !compact && (
        <div className="w-full lg:w-64 shrink-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Quick questions
            </p>
            <div className="flex flex-col gap-2">
              {quickQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  disabled={loading}
                  className="text-left rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showQuickQuestions && compact && messages.length === 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {quickQuestions.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              disabled={loading}
              className="text-left rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
