import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export type ZimraTlsConfig = {
  certPem?: string;
  keyPem?: string;
  pfxBase64?: string;
  pfxPassphrase?: string;
};

function buildHttpsOptions(
  tls: ZimraTlsConfig | null
): Pick<https.RequestOptions, "cert" | "key" | "pfx" | "passphrase"> {
  if (!tls) return {};
  if (tls.pfxBase64?.trim()) {
    return {
      pfx: Buffer.from(tls.pfxBase64, "base64"),
      ...(tls.pfxPassphrase ? { passphrase: tls.pfxPassphrase } : {}),
    };
  }
  if (tls.certPem?.trim() && tls.keyPem?.trim()) {
    return { cert: tls.certPem, key: tls.keyPem };
  }
  return {};
}

/**
 * Low-level HTTP(S) for ZIMRA FDMS. Supports optional client certificate (mTLS).
 */
export async function zimraRequest(
  urlStr: string,
  init: {
    method: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
  },
  tls: ZimraTlsConfig | null,
  timeoutMs: number
): Promise<{ statusCode: number; rawBody: string }> {
  const url = new URL(urlStr);
  const isHttps = url.protocol === "https:";
  const lib = isHttps ? https : http;

  const tlsOpts = isHttps ? buildHttpsOptions(tls) : {};

  const hdrs: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.method === "POST" && init.body && !hdrs["Content-Length"] && !hdrs["content-length"]) {
    hdrs["Content-Length"] = String(Buffer.byteLength(init.body));
  }

  const options: http.RequestOptions = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    method: init.method,
    headers: hdrs,
    ...tlsOpts,
  };

  return new Promise((resolve, reject) => {
    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(Buffer.from(c)));
      res.on("end", () => {
        clearTimeout(timer);
        resolve({
          statusCode: res.statusCode ?? 0,
          rawBody: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });

    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error("ZIMRA request timeout"));
    }, timeoutMs);

    req.on("error", (e) => {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      if (/mac verify failure/i.test(msg)) {
        reject(
          new Error(
            "Client certificate (PFX) failed to load: passphrase may be wrong. Open Fiscal settings, re-upload the PFX with the correct password, or switch to PEM certificate + key."
          )
        );
        return;
      }
      reject(e);
    });
    if (init.body && init.method === "POST") {
      req.write(init.body);
    }
    req.end();
  });
}
