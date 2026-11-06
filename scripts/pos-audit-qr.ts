/** Lists FISCALISED POS sales whose stored device receipt does not match the sale (wrong QR). Read-only. */
import * as dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
async function main() {
  const { default: dbConnect } = await import("@/lib/mongoose");
  const { default: PosSale } = await import("@/database/posSale.model");
  const { checkFiscalMatchesSale } = await import("@/lib/pos/fiscalMatch");
  await dbConnect();
  const rows = await PosSale.find({ status: "FISCALISED" }).lean<any[]>();
  let bad = 0;
  for (const s of rows) {
    const m = checkFiscalMatchesSale(s, s.fiscal);
    if (!m.ok) { bad++; console.log(`${s.invoiceNumber}\t${s.isTest ? "test" : "REAL"}\t${s.currency} ${s.totalAmount}\t${m.reason}`); }
  }
  console.log(`\n${rows.length} fiscalised, ${bad} mismatched`);
  process.exit(0);
}
main();
