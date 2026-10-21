import { Types } from "mongoose";

import Branch, { type IBranchPos } from "@/database/branch.model";
import dbConnect from "@/lib/mongoose";

/** The IBranchPos shape sent to clients: the device reference is a plain string. */
export type PosBranchPosDto = Omit<IBranchPos, "fiscalDeviceId"> & { fiscalDeviceId: string | null };

export interface PosBranchDto {
  id: string;
  name: string;
  location: string;
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

function toDto(b: BranchLean): PosBranchDto {
  return {
    id: String(b._id),
    name: b.name,
    location: b.location,
    pos: {
      ...DEFAULT_POS,
      ...(b.pos ?? {}),
      receipt: { ...(b.pos?.receipt ?? {}) },
      fiscalDeviceId: b.pos?.fiscalDeviceId ? String(b.pos.fiscalDeviceId) : null,
      // Mongoose stores "no limit" as null; keep that distinct from "not set".
      offlineLimitHours: b.pos && "offlineLimitHours" in b.pos ? (b.pos.offlineLimitHours ?? null) : 5,
    },
  };
}

export async function getPosBranch(branchId: string): Promise<PosBranchDto | null> {
  await dbConnect();
  const b = await Branch.findById(branchId).lean<BranchLean>();
  return b ? toDto(b) : null;
}

/** Admin: every branch. Others: only their own. */
export async function listPosBranches(branchId: string | null): Promise<PosBranchDto[]> {
  await dbConnect();
  const filter = branchId ? { _id: new Types.ObjectId(branchId) } : {};
  const rows = await Branch.find(filter).sort({ name: 1 }).lean<BranchLean[]>();
  return rows.map(toDto);
}
