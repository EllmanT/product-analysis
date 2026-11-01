/**
 * Pairing token: signed, expiring, tamper-proof.
 *   npx tsx scripts/test-despatch-pairing.ts
 */
process.env.AUTH_SECRET = "test-secret";
import { createPairingToken, PAIRING_TTL_MS, verifyPairingToken } from "../lib/pos/despatchPairing";

let bad = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) bad++;
};

const now = 1_000_000;
const { token, expiresAt } = createPairingToken({ branchId: "b1", tillId: "t1", userId: "u1" }, now);
const c = verifyPairingToken(token, now + 1000);
check("valid token returns its claims", c?.branchId === "b1" && c.tillId === "t1" && c.userId === "u1");
check("expiry is the TTL", expiresAt === now + PAIRING_TTL_MS);
check("null till survives", verifyPairingToken(createPairingToken({ branchId: "b", tillId: null, userId: "u" }, now).token, now)?.tillId === null);
check("expired token is refused", verifyPairingToken(token, expiresAt) === null);
const [body, sig] = token.split(".");
const forged = Buffer.from(JSON.stringify({ b: "other", t: null, u: "u1", e: expiresAt })).toString("base64url");
check("changed payload is refused", verifyPairingToken(`${forged}.${sig}`, now) === null);
check("changed signature is refused", verifyPairingToken(`${body}.${sig.slice(0, -2)}xx`, now) === null);
check("garbage is refused", verifyPairingToken("abc", now) === null && verifyPairingToken("", now) === null && verifyPairingToken(null, now) === null);
check("extra segments are refused", verifyPairingToken(`${token}.x`, now) === null);
process.env.AUTH_SECRET = "rotated";
check("rotating the secret revokes tokens", verifyPairingToken(token, now) === null);

if (bad) process.exit(1);
console.log("All checks passed");
