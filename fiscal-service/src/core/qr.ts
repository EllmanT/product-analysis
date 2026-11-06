import { fromBase64, toHex } from "./bytes.js";
import { md5 } from "./md5.js";
import { wallClock } from "./time.js";

/**
 * Data content of the verification QR code printed on every fiscal receipt:
 * qrUrl + deviceId(10 digits) + receiptDate(ddMMyyyy) + receiptGlobalNo(10
 * digits) + first 16 hex chars of MD5 over the raw signature bytes.
 *
 * Scanning it against https://fdms.zimra.co.zw validates the invoice.
 */
export function receiptQrData(params: {
  /** qrUrl from GetConfig, e.g. "https://fdmsapitest.zimra.co.zw/" */
  qrUrl: string;
  deviceId: number;
  /** The receipt's receiptDate (device local time). */
  receiptDate: Date;
  receiptGlobalNo: number;
  /** base64 device signature of the receipt (receiptDeviceSignature.signature). */
  deviceSignatureBase64: string;
}): string {
  const md5_16 = toHex(md5(fromBase64(params.deviceSignatureBase64))).slice(0, 16);

  const w = wallClock(params.receiptDate);
  const ddMMyyyy = `${w.day}${w.month}${w.year}`;

  const base = params.qrUrl.endsWith("/") ? params.qrUrl : params.qrUrl + "/";
  return (
    base +
    String(params.deviceId).padStart(10, "0") +
    ddMMyyyy +
    String(params.receiptGlobalNo).padStart(10, "0") +
    md5_16
  );
}
