import Branch from "@/database/branch.model";
import CompanyProfile, { type ICompanyProfile } from "@/database/companyProfile.model";
import dbConnect from "@/lib/mongoose";

export type CompanyProfileDto = Required<Omit<ICompanyProfile, "footerLines">> & { footerLines: string[] };

const EMPTY: CompanyProfileDto = {
  companyName: "",
  tradeName: "",
  tin: "",
  vatNumber: "",
  address: "",
  phone: "",
  email: "",
  logoUrl: "",
  footerLines: [],
};

type Raw = Partial<ICompanyProfile> & { _id?: unknown };

function clean(r: Raw | null | undefined): CompanyProfileDto {
  const out = { ...EMPTY };
  if (!r) return out;
  for (const k of Object.keys(EMPTY) as (keyof CompanyProfileDto)[]) {
    if (k === "footerLines") out.footerLines = (r.footerLines ?? []).map((l) => String(l).trim()).filter(Boolean);
    else out[k] = String(r[k] ?? "").trim();
  }
  return out;
}

/**
 * The company profile. Read on the raw collection so an older cached schema in a running dev server cannot hide
 * fields. The first time it is read, an empty profile is filled from what the branches already print (see
 * `seedFromBranches`), so nothing typed before is lost.
 */
export async function getCompanyProfile(): Promise<CompanyProfileDto> {
  await dbConnect();
  const row = await CompanyProfile.collection.findOne({});
  if (row) return clean(row as Raw);
  return seedFromBranches();
}

/** Company-wide values come from the first branch that has them; nothing is overwritten once a profile exists. */
async function seedFromBranches(): Promise<CompanyProfileDto> {
  const branches = await Branch.find({ "pos.receipt": { $exists: true } })
    .select("pos.receipt")
    .sort({ createdAt: 1 })
    .lean<{ pos?: { receipt?: Partial<ICompanyProfile> & { branchName?: string } } }[]>();
  const seed = { ...EMPTY };
  for (const b of branches) {
    const r = b.pos?.receipt ?? {};
    for (const k of ["companyName", "tin", "vatNumber", "address", "phone", "email", "logoUrl"] as const) {
      if (!seed[k] && r[k]?.trim()) seed[k] = r[k]!.trim();
    }
    if (seed.footerLines.length === 0 && r.footerLines?.length) seed.footerLines = r.footerLines.map((l) => l.trim()).filter(Boolean);
  }
  await CompanyProfile.collection.updateOne({}, { $setOnInsert: { ...seed, createdAt: new Date() }, $set: { updatedAt: new Date() } }, { upsert: true });
  return seed;
}

export async function saveCompanyProfile(input: Partial<CompanyProfileDto>): Promise<CompanyProfileDto> {
  await dbConnect();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of Object.keys(EMPTY) as (keyof CompanyProfileDto)[]) {
    if (input[k] === undefined) continue;
    set[k] = k === "footerLines" ? (input.footerLines ?? []).map((l) => l.trim()).filter(Boolean).slice(0, 6) : String(input[k]).trim();
  }
  await CompanyProfile.collection.updateOne({}, { $set: set, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  return getCompanyProfile();
}

export interface BranchContact {
  branchName: string;
  address: string;
  phone: string;
  email: string;
}

/**
 * What a slip prints for one branch: the company's name, TIN, VAT number, logo and footer (company-wide, no
 * branch override), and the branch's own name, address, phone and email, each falling back to head office.
 */
export function mergeReceipt(company: CompanyProfileDto, branch: Partial<BranchContact> | undefined) {
  const b = branch ?? {};
  return {
    companyName: company.companyName || company.tradeName,
    branchName: b.branchName?.trim() || "",
    address: b.address?.trim() || company.address,
    phone: b.phone?.trim() || company.phone,
    email: b.email?.trim() || company.email,
    tin: company.tin,
    vatNumber: company.vatNumber,
    logoUrl: company.logoUrl,
    footerLines: company.footerLines,
  };
}
