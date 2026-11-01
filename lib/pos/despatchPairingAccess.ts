import { Types } from "mongoose";

import DespatchScan from "@/database/despatchScan.model";
import User from "@/database/user.model";
import { normalizeRole } from "@/lib/auth/role";
import { verifyPairingToken, type PairingClaims } from "@/lib/pos/despatchPairing";
import dbConnect from "@/lib/mongoose";

/** Uploads one cashier's pairing may make per hour: a runaway phone or a leaked QR cannot run up the AI bill. */
export const MAX_PAIRED_UPLOADS_PER_HOUR = 40;

export type PairingCheck = { ok: true; claims: PairingClaims } | { ok: false; status: number; message: string };

/**
 * Accept a pairing token only while the cashier who showed it can still use that branch:
 * a revoked user or one moved to another branch stops working at once, not at token expiry.
 */
export async function checkPairing(token: string | null | undefined): Promise<PairingCheck> {
  const claims = verifyPairingToken(token);
  if (!claims) return { ok: false, status: 401, message: "This link has expired. Scan the QR code on the till again." };
  if (!Types.ObjectId.isValid(claims.userId) || !Types.ObjectId.isValid(claims.branchId)) {
    return { ok: false, status: 401, message: "This link is not valid. Scan the QR code on the till again." };
  }
  await dbConnect();
  const user = await User.findById(claims.userId).select("role branchId").lean<{ role?: string; branchId?: Types.ObjectId }>();
  if (!user) return { ok: false, status: 401, message: "This link is no longer valid. Scan the QR code on the till again." };
  const isAdmin = normalizeRole(user.role) === "admin";
  if (!isAdmin && String(user.branchId ?? "") !== claims.branchId) {
    return { ok: false, status: 403, message: "This link is no longer valid. Scan the QR code on the till again." };
  }
  return { ok: true, claims };
}

export async function pairedUploadsLastHour(claims: PairingClaims): Promise<number> {
  return DespatchScan.countDocuments({
    branchId: new Types.ObjectId(claims.branchId),
    createdBy: new Types.ObjectId(claims.userId),
    createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
  });
}
