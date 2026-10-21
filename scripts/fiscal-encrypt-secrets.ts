/**
 * Encrypt the ZIMRA private keys / PFX / passphrases / device login passwords already stored in Mongo
 * (central device and every branch device), and re-encrypt them after the master key is rotated.
 * Also fills in the parsed certificate expiry for older rows.
 *
 *   npm run fiscal:encrypt            dry run: shows what would change, writes nothing
 *   npm run fiscal:encrypt -- --apply do it
 *
 * Needs FISCAL_ENCRYPTION_KEY in .env.local (see .env.example). To rotate: set the new key as
 * FISCAL_ENCRYPTION_KEY with a new FISCAL_ENCRYPTION_KEY_ID, move the old key into
 * FISCAL_ENCRYPTION_KEY_PREV as {"<oldId>":"<oldKey>"}, run with --apply, then remove the old key.
 * Prints no secret values.
 */
import * as dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  const apply = process.argv.includes("--apply");
  const { default: dbConnect } = await import("@/lib/mongoose");
  const { default: FiscalCertEvent } = await import("@/database/fiscalCertEvent.model");
  const { default: FiscalDevice } = await import("@/database/fiscalDevice.model");
  const { getFiscalSettingsDoc } = await import("@/lib/services/fiscalSettings.service");
  const { CENTRAL_SCOPE, deviceScope, secretCtx } = await import("@/lib/services/fiscalCertStore");
  const { decryptSecret, encryptSecret, isEncryptionConfigured, needsReencrypt } = await import("@/lib/security/secretBox");
  const { getCertExpiryReports } = await import("@/lib/services/fiscalCertExpiry.service");

  if (!isEncryptionConfigured()) {
    throw new Error(
      "FISCAL_ENCRYPTION_KEY is not set. Generate one with:\n" +
        `  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }

  await dbConnect();

  type Holder = Record<string, unknown> & { save(): Promise<unknown> };
  const targets: { label: string; doc: Holder; fields: [string, string][] }[] = [];

  const central = (await getFiscalSettingsDoc()) as unknown as Holder;
  const cc = secretCtx(CENTRAL_SCOPE);
  targets.push({
    label: "central",
    doc: central,
    fields: [
      ["clientKeyPem", cc.key],
      ["clientPfxBase64", cc.pfx],
      ["clientPfxPassphrase", cc.pass],
    ],
  });
  for (const d of (await FiscalDevice.find()) as (Holder & { _id: unknown; name: string })[]) {
    const scope = deviceScope(String(d._id));
    const c = secretCtx(scope);
    targets.push({
      label: `device "${d.name}"`,
      doc: d,
      fields: [
        ["clientKeyPem", c.key],
        ["clientPfxBase64", c.pfx],
        ["clientPfxPassphrase", c.pass],
        ["vdPassword", `fiscal:${scope}:vdPassword`],
      ],
    });
  }

  let changed = 0;
  for (const t of targets) {
    let changedHere = 0;
    for (const [field, ctx] of t.fields) {
      const current = t.doc[field] as string | undefined;
      if (!current?.trim()) continue;
      if (!needsReencrypt(current)) continue;
      // decryptSecret returns legacy plaintext unchanged and decrypts older-key values.
      const plain = decryptSecret(current, ctx);
      if (apply) t.doc[field] = encryptSecret(plain, ctx);
      console.log(`${t.label} ${field}: ${apply ? "encrypted" : "would encrypt"}`);
      changedHere++;
    }
    if (apply && changedHere) {
      await t.doc.save();
      await FiscalCertEvent.create({ action: "encrypt_migration", detail: `${t.label}: ${changedHere} field(s) encrypted` });
    }
    changed += changedHere;
  }
  if (!changed) console.log("Everything is already encrypted with the current key");

  for (const r of await getCertExpiryReports()) {
    console.log(
      r.hasCertificate
        ? `${r.name}: certificate expires ${r.notAfter?.toISOString() ?? "unknown"} (${r.status}, ${r.daysLeft} days)`
        : `${r.name}: no certificate stored`
    );
  }
  console.log(apply ? `Done. ${changed} field(s) updated.` : `Dry run. ${changed} field(s) would change; re-run with --apply.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
