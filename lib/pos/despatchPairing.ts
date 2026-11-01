import { createHmac, timingSafeEqual } from "crypto";

/**
 * A pairing token lets a phone upload despatch slip photos into one branch (and optionally one till) without
 * signing in: the till PC shows it as a QR code. It is a signed, expiring value; nothing is stored, and it
 * authorises uploads only. Rotating AUTH_SECRET revokes every token at once.
 */
export const PAIRING_TTL_MS = 12 * 60 * 60 * 1000;

export interface PairingClaims {
  branchId: string;
  tillId: string | null;
  /** The cashier who showed the QR; scans are recorded as created by them. */
  userId: string;
  expiresAt: number;
}

const secret = () => {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not configured");
  return `despatch-pairing:${s}`;
};

const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export function createPairingToken(
  claims: Omit<PairingClaims, "expiresAt">,
  now = Date.now()
): { token: string; expiresAt: number } {
  const expiresAt = now + PAIRING_TTL_MS;
  const body = Buffer.from(JSON.stringify({ b: claims.branchId, t: claims.tillId, u: claims.userId, e: expiresAt })).toString("base64url");
  return { token: `${body}.${sign(body)}`, expiresAt };
}

/** The claims inside a token, or null when it is malformed, forged or expired. */
export function verifyPairingToken(token: string | null | undefined, now = Date.now()): PairingClaims | null {
  if (!token || token.length > 600) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { b?: unknown; t?: unknown; u?: unknown; e?: unknown };
    if (typeof c.b !== "string" || typeof c.u !== "string" || typeof c.e !== "number") return null;
    if (c.t !== null && typeof c.t !== "string") return null;
    if (c.e <= now) return null;
    return { branchId: c.b, tillId: c.t as string | null, userId: c.u, expiresAt: c.e };
  } catch {
    return null;
  }
}
