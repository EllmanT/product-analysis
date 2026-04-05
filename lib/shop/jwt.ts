import crypto from "crypto";

/** Same resolution as middleware.ts — Auth.js prefers AUTH_SECRET. */
function authSecret(): string | undefined {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
}

function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function signShopJwt(
  payload: { sub: string; email: string; firstName: string },
  maxAgeSec = 60 * 60 * 24 * 30
): string {
  const secret = authSecret();
  if (!secret) {
    throw new Error(
      "Shop auth secret is not set: define AUTH_SECRET or NEXTAUTH_SECRET in your environment (e.g. .env.local)."
    );
  }
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + maxAgeSec };
  const encHeader = base64UrlEncode(JSON.stringify(header));
  const encPayload = base64UrlEncode(JSON.stringify(body));
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${encHeader}.${encPayload}`)
    .digest();
  const encSig = base64UrlEncode(sig);
  return `${encHeader}.${encPayload}.${encSig}`;
}

function base64UrlDecodeToBuffer(segment: string): Buffer {
  let b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  return Buffer.from(b64, "base64");
}

export type ShopJwtPayload = { sub: string; email: string; firstName: string };

export function verifyShopJwt(token: string): ShopJwtPayload | null {
  const secret = authSecret();
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encHeader, encPayload, encSig] = parts;
  const expectedSig = base64UrlEncode(
    crypto
      .createHmac("sha256", secret)
      .update(`${encHeader}.${encPayload}`)
      .digest()
  );
  if (expectedSig !== encSig) return null;
  try {
    const payload = JSON.parse(
      base64UrlDecodeToBuffer(encPayload).toString("utf8")
    ) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return {
      sub: payload.sub,
      email: payload.email,
      firstName: typeof payload.firstName === "string" ? payload.firstName : "",
    };
  } catch {
    return null;
  }
}
