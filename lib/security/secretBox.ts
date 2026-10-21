import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Authenticated encryption for secrets stored in Mongo (device private keys, PFX passphrases).
 *
 * AES-256-GCM with a fresh 96-bit nonce per value. The `context` string (e.g. "fiscal:central:clientKeyPem")
 * is bound in as additional authenticated data, so a ciphertext copied to another field or device
 * fails to decrypt instead of being accepted.
 *
 * Stored form:  enc:v1:<keyId>:<iv>:<tag>:<ciphertext>   (base64url parts)
 *
 * Keys come from the environment only:
 *   FISCAL_ENCRYPTION_KEY      base64 of 32 random bytes (current key)
 *   FISCAL_ENCRYPTION_KEY_ID   label for the current key, default "k1"
 *   FISCAL_ENCRYPTION_KEY_PREV JSON object {"<keyId>":"<base64 key>"} of older keys, for rotation
 *
 * Generate a key:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

const PREFIX = "enc:v1:";
const KEY_BYTES = 32;

export class SecretBoxError extends Error {}

type KeyRing = { currentId: string; keys: Map<string, Buffer> };

function parseKey(b64: string, label: string): Buffer {
  const key = Buffer.from(b64.trim(), "base64");
  if (key.length !== KEY_BYTES) {
    throw new SecretBoxError(`${label} must be base64 of exactly ${KEY_BYTES} bytes`);
  }
  // Reject trivially weak keys such as all-zero or a single repeated byte.
  if (new Set(key).size < 8) {
    throw new SecretBoxError(`${label} is not random enough; generate a new one`);
  }
  return key;
}

function loadKeyRing(): KeyRing | null {
  const current = process.env.FISCAL_ENCRYPTION_KEY?.trim();
  if (!current) return null;
  const currentId = (process.env.FISCAL_ENCRYPTION_KEY_ID?.trim() || "k1").replace(/[^A-Za-z0-9_-]/g, "");
  const keys = new Map<string, Buffer>();
  keys.set(currentId, parseKey(current, "FISCAL_ENCRYPTION_KEY"));
  const prev = process.env.FISCAL_ENCRYPTION_KEY_PREV?.trim();
  if (prev) {
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(prev) as Record<string, string>;
    } catch {
      throw new SecretBoxError("FISCAL_ENCRYPTION_KEY_PREV must be a JSON object of keyId to base64 key");
    }
    for (const [id, b64] of Object.entries(parsed)) {
      if (id !== currentId) keys.set(id, parseKey(b64, `FISCAL_ENCRYPTION_KEY_PREV[${id}]`));
    }
  }
  return { currentId, keys };
}

export function isEncryptionConfigured(): boolean {
  try {
    return loadKeyRing() !== null;
  } catch {
    return false;
  }
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypt a secret. Empty values stay empty. Throws (fails closed) when no key is configured. */
export function encryptSecret(plain: string | null | undefined, context: string): string {
  if (!plain) return "";
  if (isEncrypted(plain)) return plain;
  const ring = loadKeyRing();
  if (!ring) {
    throw new SecretBoxError(
      "FISCAL_ENCRYPTION_KEY is not set. Refusing to store a private key unencrypted."
    );
  }
  const key = ring.keys.get(ring.currentId)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${ring.currentId}:${iv.toString("base64url")}:${tag.toString("base64url")}:${ct.toString("base64url")}`;
}

/**
 * Decrypt a stored secret. Values without the `enc:v1:` prefix are legacy plaintext and are returned
 * as-is so existing data keeps working until the migration script has run.
 */
export function decryptSecret(stored: string | null | undefined, context: string): string {
  if (!stored) return "";
  if (!isEncrypted(stored)) return stored;
  const ring = loadKeyRing();
  if (!ring) throw new SecretBoxError("FISCAL_ENCRYPTION_KEY is not set; cannot decrypt stored secret");
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 4) throw new SecretBoxError("Malformed encrypted value");
  const [keyId, iv, tag, ct] = parts;
  const key = ring.keys.get(keyId);
  if (!key) throw new SecretBoxError(`No key available for key id "${keyId}"`);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    // Deliberately vague: do not reveal whether the key, context or data was wrong.
    throw new SecretBoxError("Could not decrypt stored secret (wrong key or tampered data)");
  }
}

/** True when the value is encrypted under a key other than the current one (rotation needed). */
export function needsReencrypt(stored: string | null | undefined): boolean {
  if (!stored) return false;
  if (!isEncrypted(stored)) return true;
  const ring = loadKeyRing();
  if (!ring) return false;
  return stored.slice(PREFIX.length).split(":")[0] !== ring.currentId;
}
