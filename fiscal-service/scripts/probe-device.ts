/**
 * Read-only check of device certificates against the ZIMRA gateway: reads each bundle, checks the key
 * matches, then calls GetConfig and GetStatus (neither changes anything).
 *
 *   npm run probe -- "<folder with certificates_<id>/ subfolders>" [deviceId ...]
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { FdmsClient } from "../src/core/transport.js";
import { NodeTransport } from "../src/node/transport.js";
import { assertKeyMatchesCertificate, parseDeviceCertificate } from "../src/devices/cert-info.js";

const [root, ...only] = process.argv.slice(2);
if (!root) {
  console.error('Usage: npm run probe -- "<certificates folder>" [deviceId ...]');
  process.exit(2);
}

const dirs = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^certificates_\d+/.test(d.name))
  .map((d) => d.name)
  .filter((n) => !only.length || only.some((id) => n.includes(id)));

for (const name of dirs) {
  const dir = join(root, name);
  const certPath = join(dir, "cert.crt");
  const keyPath = join(dir, "key.key");
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    console.log(`${name}: missing cert.crt or key.key`);
    continue;
  }
  const certificatePem = readFileSync(certPath, "utf-8");
  const privateKeyPem = readFileSync(keyPath, "utf-8");
  try {
    const info = parseDeviceCertificate(certificatePem);
    assertKeyMatchesCertificate(certificatePem, privateKeyPem);
    const http = new FdmsClient(
      { deviceId: info.deviceId, serialNumber: info.serialNumber, modelName: "Server", modelVersion: "v1" },
      new NodeTransport({ certificatePem, privateKeyPem }),
      { environment: "test" },
    );
    const line = `device ${info.deviceId} ${info.serialNumber} ${info.keyType.toUpperCase()} expires ${info.notAfter.toISOString().slice(0, 10)} (${info.daysLeft} days)`;
    try {
      const cfg = await http.request<Record<string, unknown>>("GET", `/Device/v1/${info.deviceId}/GetConfig`);
      const st = await http.request<Record<string, unknown>>("GET", `/Device/v1/${info.deviceId}/GetStatus`);
      const taxes = (cfg["applicableTaxes"] as Record<string, unknown>[] | undefined) ?? [];
      console.log(`${line}\n  status: ${st["fiscalDayStatus"]} day ${st["lastFiscalDayNo"]} lastGlobalNo ${st["lastReceiptGlobalNo"]} ${st["fiscalDayClosingErrorCode"] ?? ""}`);
      console.log(`  mode: ${cfg["deviceOperatingMode"]}  dayMaxHrs: ${cfg["taxPayerDayMaxHrs"]}  qrUrl: ${cfg["qrUrl"]}`);
      console.log(`  taxes: ${taxes.map((t) => `${t["taxID"]}:${t["taxName"]}${t["taxPercent"] !== undefined ? ` ${t["taxPercent"]}%` : ""}${t["taxCode"] ? ` code ${t["taxCode"]}` : ""}`).join(" | ")}`);
    } catch (e) {
      console.log(`${line}\n  gateway: ${e instanceof Error ? e.message : String(e)}`);
    }
  } catch (e) {
    console.log(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
