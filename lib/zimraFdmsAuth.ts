import { zimraRequest } from "@/lib/zimraHttp";

const LOGIN_TIMEOUT_MS = 20_000;

let cache: { token: string; expiresAtMs: number } | null = null;

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function extractBearerToken(rawBody: string): string | null {
  const trimmed = rawBody.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("eyJ") && trimmed.split(".").length >= 3) return trimmed;
  try {
    const o = JSON.parse(trimmed) as Record<string, unknown>;
    const nested =
      o.data && typeof o.data === "object"
        ? (o.data as Record<string, unknown>)
        : null;
    const cand =
      o.token ??
      o.accessToken ??
      o.access_token ??
      o.jwt ??
      nested?.token ??
      nested?.accessToken ??
      nested?.access_token;
    return typeof cand === "string" && cand.length > 0 ? cand : null;
  } catch {
    return null;
  }
}

function jwtExpiryMs(token: string): number | null {
  try {
    const p = token.split(".")[1];
    if (!p) return null;
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as {
      exp?: number;
    };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Axis Virtual Device on HTTP often requires POST /api/Auth/login before VirtualDevice routes (401 otherwise).
 * Set ZIMRA_VD_EMAIL + ZIMRA_VD_PASSWORD in env. Skips when unset (HTTPS+mTLS-only deployments).
 */
export async function getFdmsAuthorizationHeader(baseUrl: string): Promise<string | null> {
  const email = process.env.ZIMRA_VD_EMAIL?.trim();
  const password = process.env.ZIMRA_VD_PASSWORD?.trim();
  if (!email || !password) return null;

  const now = Date.now();
  if (cache && cache.expiresAtMs > now + 30_000) {
    return `Bearer ${cache.token}`;
  }

  const url = `${normalizeBase(baseUrl)}/api/Auth/login`;
  const body = JSON.stringify({ email, password });
  const { statusCode, rawBody } = await zimraRequest(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Length": String(Buffer.byteLength(body)),
      },
      body,
    },
    null,
    LOGIN_TIMEOUT_MS
  );

  if (statusCode !== 200) {
    const preview = rawBody.trim().slice(0, 240);
    throw new Error(
      preview
        ? `FDMS login failed (HTTP ${statusCode}): ${preview}`
        : `FDMS login failed (HTTP ${statusCode}). Check ZIMRA_VD_EMAIL and ZIMRA_VD_PASSWORD.`
    );
  }

  const token = extractBearerToken(rawBody);
  if (!token) {
    throw new Error(
      "FDMS login returned HTTP 200 but no bearer token was found in the response. Check Virtual Device API version."
    );
  }

  const jwtExp = jwtExpiryMs(token);
  cache = {
    token,
    expiresAtMs: jwtExp ?? now + 55 * 60_000,
  };
  return `Bearer ${token}`;
}

export function clearFdmsAuthCache(): void {
  cache = null;
}
