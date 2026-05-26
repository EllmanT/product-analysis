"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const QUICK_QUESTIONS = [
  "What products are running low?",
  "Which branch uploaded most recently?",
  "Show me the top 10 fast-moving products",
  "Which products have zero quantity?",
  "What is the total stock value?",
];

export default function AiAgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
      const answer = data.answer ?? "Sorry, I could not get a response. Please try again.";

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: answer },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong. Please check your connection and try again.",
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
    <div className="flex flex-1 flex-col h-full">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6 justify-between">
        <div className="flex items-center gap-2 mt-2">
          <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
          <MessageCircle className="size-4 text-blue-600" />
          <h1 className="text-base font-medium">Ask AI</h1>
        </div>
      </div>

      <div className="flex flex-1 flex-col lg:flex-row gap-4 px-4 lg:px-6 py-4 min-h-0">
        {/* Chat panel */}
        <div className="flex flex-1 flex-col rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-16">
                <Bot className="size-12 opacity-30 mb-3" />
                <p className="text-sm font-medium">Ask a question about your stock</p>
                <p className="text-xs mt-1">
                  Try one of the quick questions on the right, or type your own.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs ${
                    msg.role === "user" ? "bg-blue-600" : "bg-gray-600"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User className="size-4" />
                  ) : (
                    <Bot className="size-4" />
                  )}
                </div>
                <div
                  data-testid={msg.role === "assistant" ? "ai-response" : undefined}
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
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
              <div className="flex gap-3 flex-row">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-600 text-white">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-2xl bg-gray-100 px-4 py-2.5 text-sm text-gray-500">
                  Thinking…
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 p-3">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                data-testid="ai-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question about your stock..."
                disabled={loading}
                className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 disabled:opacity-50"
              />
              <Button
                data-testid="ai-send"
                type="submit"
                disabled={loading || !input.trim()}
                className="bg-blue-600 text-white hover:bg-blue-700 rounded-xl"
                size="sm"
              >
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        </div>

        {/* Quick questions sidebar */}
        <div className="w-full lg:w-64 shrink-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Quick questions
            </p>
            <div className="flex flex-col gap-2">
              {QUICK_QUESTIONS.map((q) => (
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
      </div>
    </div>
  );
}
