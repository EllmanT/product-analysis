// LIVE INTEGRATION: OPPWA Copy & Pay API. Requires ZimSwitch credentials in .env

export type ZimswitchResultCategory =
  | "success"
  | "success_review"
  | "pending"
  | "pending_delayed"
  | "rejected"
  | "unknown";

export type ZimswitchPaymentStatus = "success" | "pending" | "failed";

// Ported from ZimswitchPaymentStatusMapper.php
const SUCCESS_PATTERN = /^(000\.000\.|000\.100\.1|000\.[36]|000\.400\.[1][12]0)/;
const SUCCESS_REVIEW_PATTERN = /^(000\.400\.0[^3]|000\.400\.100)/;
const PENDING_SHORT_PATTERN = /^(000\.200)/;
const PENDING_DELAYED_PATTERN = /^(800\.400\.5|100\.400\.500)/;
const REJECTED_3DS_PATTERN = /^(000\.400\.[1][0-9][1-9]|000\.400\.2)/;
const REJECTED_BANK_PATTERN = /^(800\.[17]00|800\.800\.[123])/;
const REJECTED_COMMUNICATION_PATTERN = /^(900\.[1234]00|000\.400\.030)/;
const REJECTED_SYSTEM_PATTERN = /^(800\.[56]|999\.|600\.1|800\.800\.[84])/;
const REJECTED_ASYNC_PATTERN = /^(100\.39[765])/;
const SOFT_DECLINE_PATTERN = /^(300\.100\.100)/;

export function classifyResultCode(resultCode: string): ZimswitchResultCategory {
  if (SUCCESS_PATTERN.test(resultCode)) return "success";
  if (SUCCESS_REVIEW_PATTERN.test(resultCode)) return "success_review";
  if (PENDING_SHORT_PATTERN.test(resultCode)) return "pending";
  if (PENDING_DELAYED_PATTERN.test(resultCode)) return "pending_delayed";
  if (
    REJECTED_3DS_PATTERN.test(resultCode) ||
    REJECTED_BANK_PATTERN.test(resultCode) ||
    REJECTED_COMMUNICATION_PATTERN.test(resultCode) ||
    REJECTED_SYSTEM_PATTERN.test(resultCode) ||
    REJECTED_ASYNC_PATTERN.test(resultCode) ||
    SOFT_DECLINE_PATTERN.test(resultCode)
  ) {
    return "rejected";
  }
  return "unknown";
}

export function categoryToPaymentStatus(
  category: ZimswitchResultCategory
): ZimswitchPaymentStatus {
  if (category === "success" || category === "success_review") return "success";
  if (category === "pending" || category === "pending_delayed") return "pending";
  return "failed";
}

function getBaseUrl(): string {
  const url = process.env.ZIMSWITCH_BASE_URL;
  if (!url) throw new Error("ZIMSWITCH_BASE_URL is not configured.");
  return url.replace(/\/$/, "");
}

function requireToken(): string {
  const token = process.env.ZIMSWITCH_AUTHORIZATION_TOKEN?.trim();
  if (!token) throw new Error("ZIMSWITCH_AUTHORIZATION_TOKEN is not configured.");
  return token;
}

function buildHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const testMode = process.env.ZIMSWITCH_TEST_MODE?.trim();
  if (testMode) headers["testMode"] = testMode;
  return headers;
}

export interface CreateCheckoutResult {
  id: string;
  result: { code?: string; description?: string };
}

export async function createCheckout(params: {
  amount: number;
  currency: string;
  entityId: string;
  paymentType: string;
}): Promise<CreateCheckoutResult> {
  const token = requireToken();
  const base = getBaseUrl();
  const amountStr = params.amount.toFixed(2);
  const currency = params.currency.toUpperCase();

  const qs = new URLSearchParams({
    entityId: params.entityId,
    amount: amountStr,
    currency,
    paymentType: params.paymentType,
  });

  const url = `${base}/v1/checkouts?${qs.toString()}`;

  console.log("[ZimSwitch] createCheckout request", {
    url,
    amount: amountStr,
    currency,
    paymentType: params.paymentType,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(token),
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }

  console.log("[ZimSwitch] createCheckout response", {
    httpStatus: response.status,
    payload: data,
  });

  if (!response.ok) {
    const desc =
      typeof (data?.result as Record<string, unknown>)?.description === "string"
        ? (data.result as Record<string, unknown>).description
        : response.statusText;
    throw new Error(`ZimSwitch checkout failed: ${desc}`);
  }

  const id = data.id;
  if (typeof id !== "string" || id === "") {
    throw new Error("ZimSwitch checkout response missing id.");
  }

  const result =
    data.result && typeof data.result === "object"
      ? (data.result as { code?: string; description?: string })
      : {};

  return { id, result };
}

export interface FetchPaymentStatusResult {
  raw: Record<string, unknown>;
  resultCode: string | null;
  description: string;
  category: ZimswitchResultCategory;
  paymentStatus: ZimswitchPaymentStatus;
}

export async function fetchPaymentStatus(params: {
  checkoutId: string;
  entityId: string;
}): Promise<FetchPaymentStatusResult> {
  const token = requireToken();
  const base = getBaseUrl();

  const qs = new URLSearchParams({ entityId: params.entityId });
  const url = `${base}/v1/checkouts/${encodeURIComponent(params.checkoutId)}/payment?${qs.toString()}`;

  console.log("[ZimSwitch] fetchPaymentStatus request", {
    checkoutId: params.checkoutId,
    url,
  });

  const response = await fetch(url, {
    method: "GET",
    headers: buildHeaders(token),
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }

  console.log("[ZimSwitch] fetchPaymentStatus response", {
    checkoutId: params.checkoutId,
    httpStatus: response.status,
    payload: data,
  });

  if (!response.ok) {
    return {
      raw: data,
      resultCode: null,
      description: "Failed to retrieve payment status",
      category: "unknown",
      paymentStatus: "failed",
    };
  }

  const resultObj =
    data.result && typeof data.result === "object"
      ? (data.result as Record<string, unknown>)
      : {};

  const resultCode =
    typeof resultObj.code === "string" && resultObj.code !== ""
      ? resultObj.code
      : null;

  const description =
    typeof resultObj.description === "string"
      ? resultObj.description
      : "Unknown status";

  if (!resultCode) {
    return {
      raw: data,
      resultCode: null,
      description: "Payment status response missing result code",
      category: "unknown",
      paymentStatus: "failed",
    };
  }

  const category = classifyResultCode(resultCode);
  const paymentStatus = categoryToPaymentStatus(category);

  return { raw: data, resultCode, description, category, paymentStatus };
}
