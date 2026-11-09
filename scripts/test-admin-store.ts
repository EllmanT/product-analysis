/**
 * Branch/store linkage: a new branch must be created under the store on the admin's own user record,
 * because that is the store the Users page lists branches from and createManagedUser accepts.
 * Throw-away database.
 *
 *   npx tsx scripts/test-admin-store.ts
 */
import * as dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

process.env.MONGO_DB_NAME = "pos_admin_store_tmp";
process.env.MONGODB_URI = process.env.OFFLINE_MONGODB_URI || "mongodb://localhost:27017/";
process.env.OFFLINE_MONGODB_URI = process.env.MONGODB_URI;
(process.env as Record<string, string>).NODE_ENV = "test";

let failures = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};

async function main() {
  console.log("\nAdmin store checks\n");
  const { default: dbConnect } = await import("@/lib/mongoose");
  const { default: User } = await import("@/database/user.model");
  const { default: Store } = await import("@/database/store.model");
  const { getUserStoreId, resolveAdminStore } = await import("@/lib/auth/admin-store");
  const { default: Branch } = await import("@/database/branch.model");

  const m = await dbConnect();
  await m.connection.dropDatabase();

  // An admin who owns two stores; the one on their user record is the SECOND.
  const admin = await User.create({ name: "A", surname: "Admin", email: "a@x.test", role: "admin" });
  const first = await Store.create({ name: "First", userId: admin._id });
  const second = await Store.create({ name: "Second", userId: admin._id });
  await User.updateOne({ _id: admin._id }, { $set: { storeId: second._id } });
  const [legacyPick] = await Store.find({ userId: admin._id });
  check(String(legacyPick._id) === String(first._id), "setup: the old lookup (Store.find by userId) picks the first store");
  check((await getUserStoreId(String(admin._id))) === String(second._id), "uses the store on the user record, not the first one owned");

  // An admin added later: has a storeId but owns no store.
  const added = await User.create({ name: "B", surname: "Added", email: "b@x.test", role: "admin", storeId: second._id });
  check((await getUserStoreId(String(added._id))) === String(second._id), "an admin who owns no store still resolves to their store");

  // Not linked / unknown / bad id.
  const unlinked = await User.create({ name: "C", surname: "None", email: "c@x.test", role: "admin" });
  check((await getUserStoreId(String(unlinked._id))) === null, "a user with no store gives null");
  check((await getUserStoreId(String(new m.Types.ObjectId()))) === null, "an unknown user gives null");
  check((await getUserStoreId("not-an-id")) === null, "a malformed id gives null");
  check((await getUserStoreId(undefined)) === null, "no id gives null");

  // resolveAdminStore: branches left under the first owned store move to the store on the record.
  const stray = await Branch.create({ name: "Stray", location: "X", storeId: first._id });
  const ok = await Branch.create({ name: "Fine", location: "Y", storeId: second._id });
  check((await resolveAdminStore(String(admin._id))) === String(second._id), "resolveAdminStore returns the store on the user record");
  check(String((await Branch.findById(stray._id))!.storeId) === String(second._id), "a branch under another owned store is moved to the primary store");
  check(String((await Branch.findById(ok._id))!.storeId) === String(second._id), "a branch already in the primary store is untouched");

  // An admin with no storeId but an owned store gets linked; branches follow.
  const orphan = await User.create({ name: "D", surname: "Orphan", email: "d@x.test", role: "admin" });
  const orphanStore = await Store.create({ name: "Orphan store", userId: orphan._id });
  const orphanBranch = await Branch.create({ name: "OB", location: "Z", storeId: orphanStore._id });
  check((await resolveAdminStore(String(orphan._id))) === String(orphanStore._id), "an admin with no storeId is linked to the store they own");
  check(String((await User.findById(orphan._id))!.storeId) === String(orphanStore._id), "the link is saved on the user record");
  check(String((await Branch.findById(orphanBranch._id))!.storeId) === String(orphanStore._id), "their branch stays where it is");
  check((await resolveAdminStore(String(unlinked._id))) === null, "an admin with no store at all gives null");

  // Another admin's stores are never touched.
  const otherBranch = await Branch.create({ name: "Other", location: "Q", storeId: orphanStore._id });
  await resolveAdminStore(String(admin._id));
  check(String((await Branch.findById(otherBranch._id))!.storeId) === String(orphanStore._id), "another admin's branch is left alone");

  await m.connection.dropDatabase();
  await m.disconnect();
  console.log(failures ? `\n${failures} check(s) FAILED\n` : "\nAll checks passed\n");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
