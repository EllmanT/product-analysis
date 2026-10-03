import { isFiscalSlip, slipDocumentHtml, type SlipBranch, type SlipSale } from "@/lib/pos/slip";

/**
 * Print a slip through a hidden iframe. On a till PC running Chrome with `--kiosk-printing`
 * this goes straight to the default printer with no dialog.
 */
export async function printSlip(
  sale: SlipSale,
  branch: SlipBranch,
  opts: { duplicate?: boolean; test?: boolean } = {}
): Promise<void> {
  let qrDataUrl: string | undefined;
  if (isFiscalSlip(sale) && sale.fiscal?.qrCodeUrl) {
    const QRCode = (await import("qrcode")).default;
    qrDataUrl = await QRCode.toDataURL(sale.fiscal.qrCodeUrl, { margin: 0, width: 300, errorCorrectionLevel: "M" });
  }

  const html = slipDocumentHtml(sale, branch, { qrDataUrl, duplicate: opts.duplicate, test: opts.test });

  await new Promise<void>((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    const cleanup = () => {
      setTimeout(() => iframe.remove(), 1000);
      resolve();
    };
    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return cleanup();
      const imgs = Array.from(win.document.images);
      const ready = Promise.all(
        imgs.map((im) => (im.complete ? Promise.resolve() : new Promise<void>((r) => { im.onload = im.onerror = () => r(); })))
      );
      // A broken logo URL must not stop the receipt from printing.
      void Promise.race([ready, new Promise((r) => setTimeout(r, 2500))]).then(() => {
        win.focus();
        win.print();
        cleanup();
      });
    };
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}
