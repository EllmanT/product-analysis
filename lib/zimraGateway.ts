import { ZIMRA_DEFAULT_TEST_BASE } from "@/lib/zimraConstants";
import { zimraRequest, type ZimraTlsConfig } from "@/lib/zimraHttp";

/**
 * ZIMRA's Fiscal Device Gateway (paths from its Swagger: /Device/v1/{deviceID}/..., /Public/v1/...).
 * This is ZIMRA's own host, not the Virtual Device we normally talk to. Used for certificate work.
 * ZIMRA_GATEWAY_URL overrides the host (staging or tests).
 */
export function gatewayBase(useProduction: boolean | undefined): string {
  const override = process.env.ZIMRA_GATEWAY_URL?.trim();
  if (override) return override.replace(/\/$/, "");
  return useProduction ? ZIMRA_DEFAULT_TEST_BASE.replace("fdmsapitest", "fdmsapi") : ZIMRA_DEFAULT_TEST_BASE;
}

export interface GatewayResult {
  status: number;
  json: Record<string, unknown> | null;
  raw: string;
}

/** Every Device call needs the model name/version the device was registered with at ZIMRA. */
export function gatewayModel(doc: { deviceModelName?: string; deviceModelVersion?: string }) {
  return {
    name: doc.deviceModelName?.trim() || process.env.ZIMRA_DEVICE_MODEL_NAME?.trim() || "Server",
    version: doc.deviceModelVersion?.trim() || process.env.ZIMRA_DEVICE_MODEL_VERSION?.trim() || "v1",
  };
}

export async function gatewayCall(opts: {
  base: string;
  path: string;
  method: "GET" | "POST";
  body?: unknown;
  tls: ZimraTlsConfig | null;
  model: { name: string; version: string };
  timeoutMs?: number;
}): Promise<GatewayResult> {
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const { statusCode, rawBody } = await zimraRequest(
    `${opts.base}${opts.path}`,
    {
      method: opts.method,
      headers: {
        Accept: "application/json",
        DeviceModelName: opts.model.name,
        DeviceModelVersion: opts.model.version,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
    },
    opts.tls,
    opts.timeoutMs ?? 30_000
  );
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: statusCode, json, raw: rawBody };
}

/** One-line reason from a Gateway error body (RFC 7807 ProblemDetails) for messages and logs. */
export function gatewayProblem(r: GatewayResult): string {
  const j = r.json ?? {};
  const code = typeof j.errorCode === "string" ? j.errorCode : "";
  const title = typeof j.title === "string" ? j.title : "";
  const detail = [code, title].filter(Boolean).join(": ");
  return detail || r.raw.slice(0, 160) || "no detail";
}
