"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import PosEmailInvoiceDialog from "@/components/pos/PosEmailInvoiceDialog";
import { Button } from "@/components/ui/button";
import { a4BodyHtml, a4Title } from "@/lib/pos/a4";
import { printSlip } from "@/lib/pos/print";
import { isFiscalSlip, type SlipSale } from "@/lib/pos/slip";
import type { PosBranchDto } from "@/lib/services/posBranch.service";

type Sale = SlipSale & { _id: string; branchId: string; lastError?: string; emailedTo?: string[] };

export default function PosInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const [sale, setSale] = useState<Sale | null>(null);
  const [branch, setBranch] = useState<PosBranchDto | null>(null);
  const [qr, setQr] = useState<string>();
  const [error, setError] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const [s, b] = await Promise.all([
          fetch(`/api/pos/sales/${id}`, { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/pos/branches", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (ignore) return;
        if (!s.success) return setError(s.message ?? "Invoice not found");
        setSale(s.data);
        setBranch((b.data as PosBranchDto[] | undefined)?.find((x) => x.id === s.data.branchId) ?? null);
      } catch {
        if (!ignore) setError("Could not reach the server");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [id]);

  const qrUrl = sale && isFiscalSlip(sale) ? sale.fiscal?.qrCodeUrl : undefined;
  useEffect(() => {
    if (!qrUrl) return setQr(undefined);
    let ignore = false;
    void import("qrcode").then(async ({ default: QRCode }) => {
      const url = await QRCode.toDataURL(qrUrl, { margin: 1, width: 320, errorCorrectionLevel: "M" });
      if (!ignore) setQr(url);
    });
    return () => {
      ignore = true;
    };
  }, [qrUrl]);

  const profile = branch?.pos.receipt ?? {};
  const html = useMemo(() => (sale ? a4BodyHtml(sale, profile, { qrSrc: qr }) : ""), [sale, profile, qr]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p role="alert" className="text-sm text-destructive">{error}</p>
        <Link href="/pos-sales" className="mt-2 inline-block text-sm underline underline-offset-4">Back to POS sales</Link>
      </div>
    );
  }
  if (!sale) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const number = sale.invoiceNumber ?? sale.provisionalNumber ?? "";
  const fiscal = isFiscalSlip(sale);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/pos-sales" className="text-sm text-muted-foreground underline-offset-4 hover:underline">← POS sales</Link>
          <h1 className="mt-1 text-xl font-semibold">
            {a4Title(sale)} {number}
          </h1>
          {!fiscal && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Not fiscalised yet{sale.lastError ? `: ${sale.lastError}` : ""}. The QR code appears once the device accepts it.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void printSlip(sale as never, profile, { duplicate: true })}>Print POS slip</Button>
          <Button variant="outline" onClick={() => void printSlip(sale as never, profile, { duplicate: true, format: "a4" })}>
            Print A4 / save as PDF
          </Button>
          <Button variant="outline" onClick={() => setEmailOpen(true)}>Email</Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        To keep a PDF, choose “Print A4 / save as PDF” and pick Microsoft Print to PDF as the printer.
        {sale.emailedTo?.length ? ` Emailed to ${sale.emailedTo.join(", ")}.` : ""}
      </p>

      <div className="overflow-x-auto rounded-xl border bg-muted/40 p-2 sm:p-4">
        <div className="mx-auto shadow-sm" dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      <PosEmailInvoiceDialog
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        saleId={sale._id}
        defaultEmail={sale.buyer?.email}
        customerName={sale.buyer?.registerName}
        onSent={(to) => setSale((s) => (s ? { ...s, emailedTo: [...new Set([...(s.emailedTo ?? []), to])] } : s))}
      />
    </div>
  );
}
