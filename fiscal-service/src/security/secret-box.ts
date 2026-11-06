/**
 * Authenticated encryption for device private keys at rest. Same stored format as the POS app's
 * lib/security/secretBox.ts (`enc:v1:<keyId>:<iv>:<tag>:<ciphertext>`, AES-256-GCM, the context bound in
 * as additional authenticated data), so values can be moved between the two.
 *
 * Keys come from the environment:
 *   FISCAL_ENCRYPTION_KEY       base64 of 32 random bytes (current key)
 *   FISCAL_ENCRYPTION_KEY_ID    label of the current key, default "k1"
 *   FISCAL_ENCRYPTION_KEY_PREV  JSON {"<keyId>":"<base64 key>"} of older keys, for rotation
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const KEY_BYTES = 32;

export class SecretBoxError extends Error {}

function parseKey(b64: string, label: string): Buffer {
  const key = Buffer.from(b64.trim(), "base64");
  if (key.length !== KEY_BYTES) throw new SecretBoxError(`${label} must be base64 of exactly ${KEY_BYTES} bytes`);
  if (new Set(key).size < 8) throw new SecretBoxError(`${label} is not random enough; generate a new one`);
  return key;
}

export class SecretBox {
  private readonly currentId: string;
  private readonly keys = new Map<string, Buffer>();

  /** Throws SecretBoxError when no usable key is configured: nothing may be stored unencrypted. */
  constructor(env: Record<string, string | undefined> = process.env) {
    const current = env.FISCAL_ENCRYPTION_KEY?.trim();
    if (!current) throw new SecretBoxError("FISCAL_ENCRYPTION_KEY is not set. Refusing to store a private key unencrypted.");
    this.currentId = (env.FISCAL_ENCRYPTION_KEY_ID?.trim() || "k1").replace(/[^A-Za-z0-9_-]/g, "");
    this.keys.set(this.currentId, parseKey(current, "FISCAL_ENCRYPTION_KEY"));
    const prev = env.FISCAL_ENCRYPTION_KEY_PREV?.trim();
    if (prev) {
      let parsed: Record<string, string>;
      try {
        parsed = JSON.parse(prev) as Record<string, string>;
      } catch {
        throw new SecretBoxError("FISCAL_ENCRYPTION_KEY_PREV must be a JSON object of keyId to base64 key");
      }
      for (const [id, b64] of Object.entries(parsed)) if (id !== this.currentId) this.keys.set(id, parseKey(b64, `FISCAL_ENCRYPTION_KEY_PREV[${id}]`));
    }
  }

  encrypt(plain: string, context: string): string {
    const key = this.keys.get(this.currentId)!;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return `${PREFIX}${this.currentId}:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ct.toString("base64url")}`;
  }

  decrypt(stored: string, context: string): string {
    if (!stored.startsWith(PREFIX)) throw new SecretBoxError("Value is not encrypted");
    const parts = stored.slice(PREFIX.length).split(":");
    if (parts.length !== 4) throw new SecretBoxError("Malformed encrypted value");
    const [keyId, iv, tag, ct] = parts as [string, string, string, string];
    const key = this.keys.get(keyId);
    if (!key) throw new SecretBoxError(`No key available for key id "${keyId}"`);
    try {
      const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      d.setAAD(Buffer.from(context, "utf8"));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
    } catch {
      throw new SecretBoxError("Could not decrypt stored secret (wrong key or tampered data)");
    }
  }

  /** True when the value was encrypted under an older key and should be re-encrypted. */
  needsReencrypt(stored: string): boolean {
    return !stored.startsWith(PREFIX) || stored.slice(PREFIX.length).split(":")[0] !== this.currentId;
  }
}
