"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onClose: () => void;
  saleId: string;
  /** The customer's email on the sale, if any. Pre-fills the field. */
  defaultEmail?: string;
  customerName?: string;
  onSent?: (to: string) => void;
}

/** Email a sale's invoice. Sends the A4 layout unless the sender picks the till slip. */
export default function PosEmailInvoiceDialog({ open, onClose, saleId, defaultEmail, customerName, onSent }: Props) {
  const [to, setTo] = useState(defaultEmail ?? "");
  const [format, setFormat] = useState<"a4" | "slip">("a4");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setTo(defaultEmail ?? "");
      setError("");
    }
  }, [open, defaultEmail]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const address = to.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) return setError("Enter a valid email address");
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/pos/sales/${saleId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: address, format }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) return setError(j?.message ?? "Could not send the email");
      toast.success(`Invoice sent to ${address}`);
      onSent?.(address);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={send} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Email invoice</DialogTitle>
            <DialogDescription>
              {defaultEmail
                ? `Using ${customerName ? `${customerName}’s` : "the customer’s"} email. Change it to send somewhere else.`
                : "No email is saved for this customer. Enter where to send it."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-email-to">Send to</Label>
            <Input id="invoice-email-to" type="email" autoFocus value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Layout</legend>
            {(
              [
                ["a4", "A4 invoice", "Recommended for email"],
                ["slip", "Till slip", "Narrow 80mm receipt"],
              ] as const
            ).map(([v, name, hint]) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-ring has-[:checked]:bg-muted/50">
                <input type="radio" name="invoice-format" checked={format === v} onChange={() => setFormat(v)} />
                <span className="font-medium">{name}</span>
                <span className="text-muted-foreground">{hint}</span>
              </label>
            ))}
          </fieldset>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
