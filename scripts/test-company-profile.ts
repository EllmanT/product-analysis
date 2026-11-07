/**
 * The company profile and the receipt it builds for each branch. Needs MongoDB (a throw-away database).
 *
 *   npm run test:company
 */
import * as dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
const MONGO = process.env.OFFLINE_MONGODB_URI || "mongodb://localhost:27017/";
process.env.MONGO_DB_NAME = "company_profile_tmp";
process.env.MONGODB_URI = MONGO;
process.env.OFFLINE_MONGODB_URI = MONGO;
(process.env as Record<string, string>).NODE_ENV = "test";

let failures = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};

async function main() {
  console.log("\nCompany profile and receipts\n");
  const { default: dbConnect } = await import("@/lib/mongoose");
  const { default: Branch } = await import("@/database/branch.model");
  const { getCompanyProfile, saveCompanyProfile } = await import("@/lib/services/companyProfile.service");
  const { getPosBranch, listPosBranches } = await import("@/lib/services/posBranch.service");
  const m = await dbConnect();
  await m.connection.dropDatabase();

  console.log("1. First read fills the profile from what branches already print");
  const storeId = new m.Types.ObjectId();
  const harare = await Branch.create({
    name: "Harare", storeId, location: "Harare",
    pos: { enabled: true, invoicePrefix: "H", receipt: { companyName: "Acme Ltd", tin: "1234567890", vatNumber: "V1", address: "1 Main St", phone: "0771", footerLines: ["Thanks"] } },
  });
  const seeded = await getCompanyProfile();
  check(seeded.companyName === "Acme Ltd" && seeded.tin === "1234567890" && seeded.footerLines[0] === "Thanks", "name, TIN, VAT and footer are carried over", seeded);

  console.log("2. A branch prints the company's details plus its own contact");
  await saveCompanyProfile({ companyName: "Acme (Pvt) Ltd", tin: "9999999999", vatNumber: "V9", address: "Head office road", phone: "0242", email: "hq@acme.test", footerLines: ["Come again", "No refunds"] });
  const b1 = await getPosBranch(String(harare._id));
  check(b1?.pos.receipt.companyName === "Acme (Pvt) Ltd" && b1.pos.receipt.tin === "9999999999", "company name and TIN come from the company profile, not the branch's old copy", b1?.pos.receipt);
  check(b1?.pos.receipt.address === "1 Main St" && b1.pos.receipt.phone === "0771", "the branch's own address and phone are used", b1?.pos.receipt);
  check(b1?.pos.receipt.email === "hq@acme.test", "an empty branch email falls back to head office", b1?.pos.receipt.email);
  check(JSON.stringify(b1?.pos.receipt.footerLines) === JSON.stringify(["Come again", "No refunds"]), "the footer is company-wide");

  console.log("3. A new branch with no contact prints head office");
  const bare = await Branch.create({ name: "Gweru", storeId, location: "Gweru", pos: { enabled: true, invoicePrefix: "G" } });
  const b2 = await getPosBranch(String(bare._id));
  check(b2?.pos.receipt.address === "Head office road" && b2.pos.receipt.phone === "0242", "address and phone fall back to head office", b2?.pos.receipt);
  check(b2?.contact.address === "" && b2.contact.branchName === "Gweru", "the branch's own record stays empty so it can be edited", b2?.contact);

  console.log("4. Changing the company profile changes every branch at once");
  await saveCompanyProfile({ companyName: "Renamed Ltd" });
  const all = await listPosBranches(null);
  check(all.length === 2 && all.every((b) => b.pos.receipt.companyName === "Renamed Ltd"), "every branch prints the new name", all.map((b) => b.pos.receipt.companyName));
  const kept = await getCompanyProfile();
  check(kept.tin === "9999999999", "fields not sent are left alone");

  await m.connection.dropDatabase();
  await m.connection.close();
  console.log(failures ? `\n${failures} check(s) FAILED\n` : "\nAll checks passed\n");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
