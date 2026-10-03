/**
 * Browser-side storage for the till's offline mode (IndexedDB, no dependencies).
 *
 *   queue     sales made while the server was unreachable, waiting to sync
 *   kv        small values: cached product list, leased provisional numbers, offline-since time
 *
 * Everything here is best effort: if IndexedDB is unavailable (private window, blocked) the till
 * still works online, it just cannot sell offline, and says so.
 */

export interface QueuedSale {
  /** idempotency key; also the queue key */
  id: string;
  branchId: string;
  /** exactly what POST /api/pos/sales will receive (without the key) */
  payload: Record<string, unknown>;
  /** what the slip printed (and the Sales drawer shows) while the sale waits */
  display: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  /** set when the server refused it for a reason a retry will not fix */
  error?: string;
}

const DB_NAME = "pos-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "id" });
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function run<T>(store: "queue" | "kv", mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export const storageAvailable = () => open().then(() => true, () => false);

// ---- queue ------------------------------------------------------------------

export const queuePut = (s: QueuedSale) => run("queue", "readwrite", (st) => st.put(s)).then(() => undefined);
export const queueDelete = (id: string) => run("queue", "readwrite", (st) => st.delete(id)).then(() => undefined);

export async function queueList(branchId: string): Promise<QueuedSale[]> {
  const all = await run<QueuedSale[]>("queue", "readonly", (st) => st.getAll());
  return all.filter((s) => s.branchId === branchId).sort((a, b) => a.createdAt - b.createdAt);
}

// ---- kv ---------------------------------------------------------------------

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    return (await run<T | undefined>("kv", "readonly", (st) => st.get(key))) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    await run("kv", "readwrite", (st) => st.put(value, key));
  } catch {
    /* best effort */
  }
}

export async function kvDelete(key: string): Promise<void> {
  try {
    await run("kv", "readwrite", (st) => st.delete(key));
  } catch {
    /* best effort */
  }
}

/** Forget everything on this device (used at sign out so a shared PC keeps nothing of the last cashier). */
export async function clearAll(): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["kv"], "readwrite");
      tx.objectStore("kv").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

// ---- provisional number blocks -------------------------------------------------

/** Leased provisional numbers, per branch and currency, consumed in order. */
export interface NumberBlock {
  numbers: string[];
}
const blockKey = (branchId: string, currency: string) => `numbers:${branchId}:${currency}`;

export async function takeProvisionalNumber(branchId: string, currency: string): Promise<string | null> {
  const block = (await kvGet<NumberBlock>(blockKey(branchId, currency))) ?? { numbers: [] };
  const next = block.numbers.shift();
  await kvSet(blockKey(branchId, currency), block);
  return next ?? null;
}

export async function remainingNumbers(branchId: string, currency: string): Promise<number> {
  return ((await kvGet<NumberBlock>(blockKey(branchId, currency))) ?? { numbers: [] }).numbers.length;
}

export async function addNumbers(branchId: string, currency: string, numbers: string[]): Promise<void> {
  const block = (await kvGet<NumberBlock>(blockKey(branchId, currency))) ?? { numbers: [] };
  const have = new Set(block.numbers);
  for (const n of numbers) if (!have.has(n)) block.numbers.push(n);
  await kvSet(blockKey(branchId, currency), block);
}

/**
 * Last resort when a till has used its whole leased block while offline: a number from a
 * till-unique series (HUQ7K30001) so service never stops. The server accepts and de-duplicates it.
 */
export async function fallbackNumber(prefix: string, currency: string): Promise<string> {
  let tillCode = await kvGet<string>("tillCode");
  if (!tillCode) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    tillCode = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => chars[b % chars.length]).join("");
    await kvSet("tillCode", tillCode);
  }
  const seq = ((await kvGet<number>("fallbackSeq")) ?? 0) + 1;
  await kvSet("fallbackSeq", seq);
  return `${prefix}${currency === "USD" ? "U" : "Z"}Q${tillCode}${String(seq).padStart(4, "0")}`;
}
