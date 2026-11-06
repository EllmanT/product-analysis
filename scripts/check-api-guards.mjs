// Fails when an API route has no recognisable auth check and is not on the public list.
// Run: npm run check:guards
import fs from "node:fs";
import path from "node:path";

const ROOT = "app/api";
// Routes that are public on purpose. Keep this list short and justify each entry.
const PUBLIC_PREFIXES = [
  "app/api/auth/", // sign-in/sign-up flow
  "app/api/cron/", // protected by CRON_SECRET bearer
  "app/api/scan/", // phone scan pages, protected by one-time token
  "app/api/shop/", // storefront: checked separately (customer session or public catalogue)
  "app/api/payments/", // payment provider callbacks and customer polling
];
const GUARD = /(requireAdmin|requirePermission|requireAuth|requireStoreAccess|resolvePosScope|guardSignedIn|guardStore|guardBranch|\bauth\(|getToken|currentUser|handleCertificateUpload|handleRegistration)/;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.posix.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name === "route.ts" ? [p] : [];
  });
}

const missing = walk(ROOT).filter((f) => {
  if (PUBLIC_PREFIXES.some((p) => f.startsWith(p))) return false;
  return !GUARD.test(fs.readFileSync(f, "utf8"));
});

if (missing.length) {
  console.error("API routes without an auth check:\n" + missing.map((m) => "  " + m).join("\n"));
  process.exit(1);
}
console.log("All non-public API routes have an auth check.");
