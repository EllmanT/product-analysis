"use client";

import { Loader2, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
  branchId: string;
  tillId: string | null;
}

/** Shows a QR code that opens the slip-capture page on a phone, already paired to this till's branch. */
export default function PhoneScanDialog({ open, onClose, branchId, tillId }: Props) {
  const [qr, setQr] = useState("");
  const [link, setLink] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const [nonce, setNonce] = useState(0);

  // The dialog mounts busy; "New code" sets busy and bumps the nonce, so nothing here sets state before its first await.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch("/api/pos/despatch-scans/pairing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branchId, tillId }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok || !j?.data?.path) throw new Error(j?.message ?? "Could not create the link");
        const url = `${window.location.origin}${j.data.path}`;
        const image = await QRCode.toDataURL(url, { width: 480, margin: 1, errorCorrectionLevel: "M" });
        if (cancelled) return;
        setLink(url);
        setExpiresAt(new Date(j.data.expiresAt));
        setQr(image);
        setError("");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not create the link");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [branchId, tillId, nonce]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Scan a slip with your phone</DialogTitle>
          <DialogDescription>
            Point the phone camera at this code, then photograph the despatch slip. It arrives on this till.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          <div className="grid size-60 place-items-center rounded-lg border bg-white p-2">
            {busy && !qr ? (
              <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Creating link" />
            ) : qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code that opens the slip scanner on your phone" className="size-full" />
            ) : null}
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          {link && (
            <p className="max-w-full break-all text-center text-xs text-muted-foreground select-all">{link}</p>
          )}
          {expiresAt && (
            <p className="text-xs text-muted-foreground">
              Works until {expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Anyone with this code can send
              slips to this branch, so do not share it.
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setBusy(true);
              setNonce((n) => n + 1);
            }}
            disabled={busy}
          >
            <RefreshCw className="size-3.5" aria-hidden /> New code
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
