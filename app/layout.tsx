import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { ReactNode } from "react";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StockFlow",
  description: "Get product data insights",
};

const RootLayout = async ({ children }: { children: ReactNode }) => {
  // #region agent log
  fetch("http://127.0.0.1:7467/ingest/2de68ee5-e25c-499c-9697-defc2dfd27b9", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "61e806",
    },
    body: JSON.stringify({
      sessionId: "61e806",
      runId: "pre-fix",
      hypothesisId: "H4",
      location: "app/layout.tsx:beforeAuth",
      message: "root layout before auth()",
      data: {},
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const session = await auth();
  let sessionJsonOk = true;
  try {
    JSON.stringify(session);
  } catch {
    sessionJsonOk = false;
  }
  // #region agent log
  fetch("http://127.0.0.1:7467/ingest/2de68ee5-e25c-499c-9697-defc2dfd27b9", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "61e806",
    },
    body: JSON.stringify({
      sessionId: "61e806",
      runId: "pre-fix",
      hypothesisId: "H4",
      location: "app/layout.tsx:afterAuth",
      message: "root layout after auth()",
      data: { sessionJsonOk, hasSession: Boolean(session) },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return (
    <html lang="en">
      <SessionProvider session={session}>
        
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Toaster />

      </body>
      </SessionProvider>
    </html>
  );
}
export default RootLayout
