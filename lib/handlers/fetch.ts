import logger from "../logger";
import handleError from "./error";
import { RequestError } from "../http-errors";

interface FetchOptions extends RequestInit {
  timeOut?: number;
}

function isError(error: unknown): error is Error {
  return error instanceof Error;
}

export async function fetchHandler<T>(
  url: string,
  options: FetchOptions = {}
): Promise<ActionResponse<T>> {
  const {
    timeOut = 5000,
    headers: customHeaders = {},
    body,
    ...restOptions
  } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeOut);

  const isFormData = body instanceof FormData;

  const headers: HeadersInit = isFormData
    ? { ...customHeaders } // 🚫 Don't override Content-Type
    : {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...customHeaders,
      };

  const config: RequestInit = {
    ...restOptions,
    method: restOptions.method || "GET",
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    signal: controller.signal,
  };

  try {
    const response = await fetch(url, config);
    clearTimeout(id);

    if (!response.ok) {
      throw new RequestError(
        response.status,
        `HTTP ERROR : ${response.status}`
      );
    }

    const contentType = response.headers.get("Content-Type") || "";

    if (contentType.includes("application/json")) {
      return await response.json();
    }

    return {} as ActionResponse<T>;
  } catch (error) {
    const err = isError(error) ? error : new Error("An unknown error occurred");

    if (err.name === "AbortError") {
      logger.warn(`Request to ${url} timed out after ${timeOut}ms`);
    } else {
      logger.error(`Error fetching ${url}`, err.message);
    }

    return handleError(err) as ActionResponse<T>;
  }
}
