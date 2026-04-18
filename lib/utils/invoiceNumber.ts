import Invoice from "@/database/invoice.model";

function randomAlphanumeric(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function ymdCompact(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// Format: INV-{CCY}-{YYYYMMDD}-{RAND4}
// Example: INV-USD-20260418-AB3K
export async function generateInvoiceNumber(currency: string): Promise<string> {
  const ccy = (currency || "USD").toUpperCase();
  const ymd = ymdCompact(new Date());

  for (let attempt = 0; attempt < 5; attempt++) {
    const rand = randomAlphanumeric(4);
    const candidate = `INV-${ccy}-${ymd}-${rand}`;

    const exists = await Invoice.exists({ invoiceNumber: candidate });
    if (!exists) {
      return candidate;
    }
  }

  // Fallback: use timestamp suffix
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  return `INV-${ccy}-${ymd}-${ts}`;
}
