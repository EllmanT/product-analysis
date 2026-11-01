"use client";

import { Camera, Check, Images, Loader2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { downscaleToJpeg } from "@/lib/pos/downscaleImage";
import { cn } from "@/lib/utils";

type Phase =
  | { name: "idle" }
  | { name: "preparing" }
  | { name: "uploading" }
  | { name: "reading"; id: string }
  | { name: "done"; slipNumber: string | null; lineCount: number }
  | { name: "error"; message: string; retryable: boolean };

const POLL_MS = 2000;
/** Stop waiting after this long: the till still gets the slip when the AI finishes. */
const GIVE_UP_MS = 90_000;

/** Phone page: take a photo of a despatch slip and send it to the till. */
export default function ScanCapture({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>(token ? { name: "idle" } : { name: "error", message: "Open this page by scanning the QR code on the till.", retryable: false });
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const poll = useCallback(
    async (id: string) => {
      const started = Date.now();
      while (alive.current) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (!alive.current) return;
        try {
          const res = await fetch(`/api/scan/status?t=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`, { cache: "no-store" });
          const j = await res.json().catch(() => null);
          if (res.status === 401 || res.status === 403) {
            return setPhase({ name: "error", message: j?.message ?? "This link has expired. Scan the QR code on the till again.", retryable: false });
          }
          if (res.ok && j?.data?.status === "failed") {
            return setPhase({
              name: "error",
              message: "The slip could not be read. Take a clearer photo with the whole slip in view.",
              retryable: true,
            });
          }
          if (res.ok && j?.data && j.data.status !== "processing") {
            return setPhase({ name: "done", slipNumber: j.data.slipNumber ?? null, lineCount: j.data.lineCount ?? 0 });
          }
        } catch {
          /* a dropped request on shop Wi-Fi: keep trying until the deadline */
        }
        if (Date.now() - started > GIVE_UP_MS) {
          return setPhase({ name: "done", slipNumber: null, lineCount: 0 });
        }
      }
    },
    [token]
  );

  const send = useCallback(
    async (blob: Blob) => {
      setPhase({ name: "uploading" });
      const form = new FormData();
      form.set("token", token);
      form.set("image", blob, "slip.jpg");
      try {
        const res = await fetch("/api/scan/upload", { method: "POST", body: form });
        const j = await res.json().catch(() => null);
        if (res.status === 409 && j?.existingScanId) {
          return setPhase({ name: "error", message: "This photo was already sent to the till.", retryable: false });
        }
        if (!res.ok || !j?.data?.id) {
          return setPhase({
            name: "error",
            message: j?.message ?? "Could not send the photo. Check the Wi-Fi and try again.",
            retryable: res.status !== 401 && res.status !== 403 && res.status !== 429,
          });
        }
        setPhase({ name: "reading", id: j.data.id });
        void poll(j.data.id);
      } catch {
        setPhase({ name: "error", message: "Could not reach the server. Check the Wi-Fi and try again.", retryable: true });
      }
    },
    [token, poll]
  );

  async function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same file again still fires
    if (!file) return;
    setPhase({ name: "preparing" });
    try {
      const blob = await downscaleToJpeg(file);
      setLastBlob(blob);
      await send(blob);
    } catch {
      setPhase({ name: "error", message: "That photo could not be opened. Try another.", retryable: true });
    }
  }

  const busy = phase.name === "preparing" || phase.name === "uploading" || phase.name === "reading";
  const canCapture = phase.name === "idle" || phase.name === "done" || (phase.name === "error" && phase.retryable);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 pb-8 pt-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Scan despatch slip</h1>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Lay the slip flat in good light and keep every line in the frame. It appears on the till in a few seconds.
        </p>
      </header>

      <section aria-live="polite" className="min-h-28">
        {phase.name === "preparing" && <Status icon={<Loader2 className="size-5 animate-spin" />} title="Preparing photo…" />}
        {phase.name === "uploading" && <Status icon={<Loader2 className="size-5 animate-spin" />} title="Sending to the till…" />}
        {phase.name === "reading" && (
          <Status icon={<Loader2 className="size-5 animate-spin" />} title="Reading the slip…" detail="You can take the next photo once this finishes." />
        )}
        {phase.name === "done" && (
          <Status
            tone="ok"
            icon={<Check className="size-5" />}
            title={phase.lineCount > 0 ? `Sent to the till: ${phase.lineCount} line${phase.lineCount === 1 ? "" : "s"}` : "Sent to the till"}
            detail={
              phase.slipNumber
                ? `Slip ${phase.slipNumber}. The cashier can review it now.`
                : phase.lineCount > 0
                  ? "The cashier can review it now."
                  : "The cashier will see it as soon as it has been read."
            }
          />
        )}
        {phase.name === "error" && <Status tone="error" icon={<TriangleAlert className="size-5" />} title={phase.message} />}
      </section>

      <div className="mt-auto flex flex-col gap-3">
        <button
          type="button"
          disabled={!canCapture}
          onClick={() => cameraRef.current?.click()}
          className={cn(
            "inline-flex min-h-16 items-center justify-center gap-3 rounded-xl bg-primary px-6 text-lg font-medium text-primary-foreground",
            "transition-transform duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          )}
        >
          <Camera className="size-6" aria-hidden />
          {phase.name === "done" ? "Scan another slip" : phase.name === "error" && phase.retryable ? "Take photo again" : "Take photo"}
        </button>

        <button
          type="button"
          disabled={!canCapture}
          onClick={() => galleryRef.current?.click()}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-6 text-sm font-medium transition-transform duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Images className="size-4" aria-hidden />
          Choose from photos
        </button>

        {phase.name === "error" && phase.retryable && lastBlob && (
          <button
            type="button"
            onClick={() => void send(lastBlob)}
            className="min-h-11 rounded-xl text-sm font-medium text-muted-foreground underline underline-offset-4 active:opacity-70"
          >
            Send the same photo again
          </button>
        )}

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPicked} disabled={busy} />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onPicked} disabled={busy} />
      </div>
    </main>
  );
}

function Status({ icon, title, detail, tone }: { icon: React.ReactNode; title: string; detail?: string; tone?: "ok" | "error" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-xl border p-4",
        tone === "ok" && "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
        tone === "error" && "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
      )}
    >
      <span className="mt-0.5 shrink-0" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-medium text-pretty">{title}</p>
        {detail && <p className="mt-0.5 text-sm opacity-80 text-pretty">{detail}</p>}
      </div>
    </div>
  );
}
