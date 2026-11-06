import { FdmsClient } from "../core/transport.js";
import { NodeTransport } from "../node/transport.js";
import type { DeviceConfigSnapshot, GatewayVerifier } from "./registry.js";

/** A client for one device over mutual TLS. `baseUrl` overrides the ZIMRA host (a local fake, in tests). */
export function gatewayClient(
  id: { deviceId: number; serialNumber: string; certificatePem: string; privateKeyPem: string; environment: "test" | "production" },
  baseUrl?: string
): FdmsClient {
  return new FdmsClient(
    { deviceId: id.deviceId, serialNumber: id.serialNumber, modelName: "Server", modelVersion: "v1" },
    new NodeTransport({ certificatePem: id.certificatePem, privateKeyPem: id.privateKeyPem }),
    { environment: id.environment, baseUrl }
  );
}

/** Real verifier: GetConfig over mutual TLS proves ZIMRA accepts the certificate and key for this device. */
export function createGatewayVerifier(baseUrl?: string): GatewayVerifier {
  return async (id): Promise<DeviceConfigSnapshot> => {
    const cfg = await gatewayClient(id, baseUrl).request<Record<string, unknown>>("GET", `/Device/v1/${id.deviceId}/GetConfig`);
    if (String(cfg["deviceSerialNo"] ?? id.serialNumber) !== id.serialNumber) {
      throw new Error(`the gateway reports serial ${String(cfg["deviceSerialNo"])}, the certificate says ${id.serialNumber}`);
    }
    return {
      taxPayerName: cfg["taxPayerName"] as string | undefined,
      taxPayerTIN: cfg["taxPayerTIN"] as string | undefined,
      vatNumber: cfg["vatNumber"] as string | undefined,
      deviceOperatingMode: cfg["deviceOperatingMode"] as string | undefined,
      taxPayerDayMaxHrs: cfg["taxPayerDayMaxHrs"] as number | undefined,
      qrUrl: cfg["qrUrl"] as string | undefined,
      certificateValidTill: cfg["certificateValidTill"] as string | undefined,
      applicableTaxes: cfg["applicableTaxes"] as unknown[] | undefined,
      fetchedAt: new Date(),
    };
  };
}
