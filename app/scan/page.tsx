import type { Metadata, Viewport } from "next";

import ScanCapture from "@/components/pos/ScanCapture";

export const metadata: Metadata = { title: "Scan despatch slip", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/** Opened on a phone from the QR code on the till. No sign-in: the token in the link is the pass. */
export default async function ScanPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return <ScanCapture token={typeof t === "string" ? t : ""} />;
}
