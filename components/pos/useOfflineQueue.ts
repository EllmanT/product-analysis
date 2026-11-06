"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSelectedTillId } from "@/lib/pos/tillSelection";

import {
  addNumbers,
  kvDelete,
  kvGet,
  kvSet,
  queueDelete,
  queueList,
  queuePut,
  remainingNumbers,
  storageAvailable,
  type QueuedSale,
} from "@/lib/pos/offlineStore";

const LOW_WATER = 40;
const LEASE_COUNT = 100;
const SYNC_EVERY_MS = 20_000;

interface Options {
  branchId: string;
  /** Called after sales were accepted by the server (so the screen can refresh its totals). */
  onSynced: (count: number) => void;
}

/**
 * Offline mode for the till.
 *
 * - `reachable` is decided by real requests, not navigator.onLine (a LAN without internet reports "online").
 * - Sales made while unreachable are stored on the device with the provisional number already printed,
 *   and are sent, oldest first, as soon as the server answers again. The idempotency key makes a
 *   repeated send harmless.
 * - `offlineSince` starts the offline-limit clock and survives a page reload.
 */
export function useOfflineQueue({ branchId, onSynced }: Options) {
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [reachable, setReachable] = useState(true);
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const syncing = useRef(false);
  const onSyncedRef = useRef(onSynced);
  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  const refreshQueue = useCallback(async () => {
    try {
      setQueue(await queueList(branchId));
    } catch {
      /* storage unavailable: nothing to show */
    }
  }, [branchId]);

  /** Record the result of any real request to the server. */
  const markReachable = useCallback(
    async (ok: boolean) => {
      setReachable(ok);
      if (ok) {
        setOfflineSince(null);
        await kvDelete(`offlineSince:${branchId}`);
      } else {
        const existing = await kvGet<number>(`offlineSince:${branchId}`);
        const since = existing ?? Date.now();
        if (existing === undefined) await kvSet(`offlineSince:${branchId}`, since);
        setOfflineSince(since);
      }
    },
    [branchId]
  );

  const ensureNumbers = useCallback(async () => {
    for (const currency of ["USD", "ZWG"] as const) {
      try {
        if ((await remainingNumbers(branchId, currency)) >= LOW_WATER) continue;
        const r = await fetch("/api/pos/numbers/lease", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branchId, currency, count: LEASE_COUNT, ...(getSelectedTillId(branchId) ? { tillId: getSelectedTillId(branchId) } : {}) }),
          signal: AbortSignal.timeout(10_000),
        });
        const j = await r.json().catch(() => null);
        if (r.ok && j?.success) await addNumbers(branchId, currency, j.data.numbers);
      } catch {
        /* offline: try again next time */
      }
    }
  }, [branchId]);

  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    let synced = 0;
    try {
      const items = await queueList(branchId);
      for (const it of items) {
        if (it.error) continue;
        try {
          const r = await fetch("/api/pos/sales", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...it.payload, idempotencyKey: it.id }),
            signal: AbortSignal.timeout(60_000),
          });
          const j = await r.json().catch(() => null);
          await markReachable(true);
          if (r.ok && j?.success) {
            await queueDelete(it.id);
            synced++;
          } else if (r.status === 401 || r.status === 403 || (r.status === 404 && !j)) {
            setAuthExpired(true); // keep everything; the cashier signs in again to release it
            break;
          } else if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) {
            await queuePut({ ...it, attempts: it.attempts + 1, error: j?.message ?? `Rejected (HTTP ${r.status})` });
          } else {
            break; // server trouble: retry later, keep order
          }
        } catch {
          await markReachable(false);
          break;
        }
      }
      if (synced > 0) setAuthExpired(false);
    } catch {
      /* storage trouble */
    } finally {
      syncing.current = false;
      await refreshQueue();
      if (synced > 0) onSyncedRef.current(synced);
    }
  }, [branchId, markReachable, refreshQueue]);

  const enqueue = useCallback(
    async (sale: QueuedSale) => {
      await queuePut(sale);
      await refreshQueue();
    },
    [refreshQueue]
  );

  // initial load + periodic sync
  useEffect(() => {
    let ignore = false;
    (async () => {
      const ok = await storageAvailable();
      if (ignore) return;
      setStorageOk(ok);
      const since = await kvGet<number>(`offlineSince:${branchId}`);
      if (!ignore && since) setOfflineSince(since);
      await refreshQueue();
      void ensureNumbers();
      void sync();
    })();
    const t = setInterval(() => {
      void sync();
      void ensureNumbers();
    }, SYNC_EVERY_MS);
    const onOnline = () => {
      void sync();
      void ensureNumbers();
    };
    window.addEventListener("online", onOnline);
    return () => {
      ignore = true;
      clearInterval(t);
      window.removeEventListener("online", onOnline);
    };
  }, [branchId, refreshQueue, ensureNumbers, sync]);

  return { queue, reachable, offlineSince, authExpired, storageOk, markReachable, enqueue, sync, refreshQueue, ensureNumbers };
}
