import { Types } from "mongoose";

import Branch, { type IBranchPos } from "@/database/branch.model";
import dbConnect from "@/lib/mongoose";
import { getCompanyProfile, mergeReceipt, type BranchContact, type CompanyProfileDto } from "@/lib/services/companyProfile.service";

/** The IBranchPos shape sent to clients: the device reference is a plain string. */
export type PosBranchPosDto = Omit<IBranchPos, "fiscalDeviceId"> & { fiscalDeviceId: string | null };

export interface PosBranchDto {
  id: string;
  name: string;
  location: string;
  /** What this branch itself holds for its slips (name, address, phone, email). Empty fields print head office's. */
  contact: BranchContact;
  /** `pos.receipt` is the finished result: company-wide details merged with this branch's contact details. */
  pos: PosBranchPosDto;
}

const DEFAULT_POS: PosBranchPosDto = {
  enabled: false,
  taxPercent: 15.5,
  taxCode: "A",
  taxInclusive: true,
  defaultCurrency: "USD",
  offlineLimitHours: 5,
  fiscalDeviceId: null,
  receipt: {},
};

type BranchLean = {
  _id: Types.ObjectId;
  name: string;
  location: string;
  pos?: Partial<IBranchPos>;
};

function toDto(b: BranchLean, company: CompanyProfileDto): PosBranchDto {
  const r = b.pos?.receipt ?? {};
  const contact: BranchContact = { branchName: r.branchName?.trim() || b.name, address: r.address?.trim() ?? "", phone: r.phone?.trim() ?? "", email: r.email?.trim() ?? "" };
  return {
    id: String(b._id),
    name: b.name,
    location: b.location,
    contact,
    pos: {
      ...DEFAULT_POS,
      ...(b.pos ?? {}),
      receipt: mergeReceipt(company, contact),
      fiscalDeviceId: b.pos?.fiscalDeviceId ? String(b.pos.fiscalDeviceId) : null,
      // Mongoose stores "no limit" as null; keep that distinct from "not set".
      offlineLimitHours: b.pos && "offlineLimitHours" in b.pos ? (b.pos.offlineLimitHours ?? null) : 5,
    },
  };
}

export async function getPosBranch(branchId: string): Promise<PosBranchDto | null> {
  await dbConnect();
  const b = await Branch.findById(branchId).lean<BranchLean>();
  return b ? toDto(b, await getCompanyProfile()) : null;
}

/** Admin: every branch. Others: only their own. */
export async function listPosBranches(branchId: string | null): Promise<PosBranchDto[]> {
  await dbConnect();
  const filter = branchId ? { _id: new Types.ObjectId(branchId) } : {};
  const rows = await Branch.find(filter).sort({ name: 1 }).lean<BranchLean[]>();
  const company = await getCompanyProfile();
  return rows.map((r) => toDto(r, company));
}
