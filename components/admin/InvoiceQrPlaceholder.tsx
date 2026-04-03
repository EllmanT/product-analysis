"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function InvoiceQrPlaceholder({ data }: { data: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(data, { width: 220, margin: 2 })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (!src) {
    return (
      <div className="flex h-[220px] w-[220px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
        Generating QR…
      </div>
    );
  }

  return (
    <img src={src} alt="Invoice QR code placeholder" width={220} height={220} />
  );
}
