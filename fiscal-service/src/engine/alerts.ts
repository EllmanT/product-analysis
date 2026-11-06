import { ObjectId, type Db } from "mongodb";

import type { Alert } from "./engine.js";

export interface StoredAlert {
  id: string;
  deviceKey: string;
  kind: string;
  message: string;
  details?: Record<string, unknown>;
  /** The day (UTC) the alert belongs to. One record per device + kind + day: repeats only bump `count`. */
  day: string;
  count: number;
  firstAt: Date;
  lastAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
}

interface Doc extends Omit<StoredAlert, "id"> {
  _id: ObjectId;
}

/**
 * Durable alerts. The engine raises the same alert again and again (every retry of a stuck close, every
 * paused-device check), so the store keeps ONE record per device + kind + day with a counter. The POS app
 * polls this list, emails the administrators once per record and shows the open ones on the Fiscal Day page.
 */
export class AlertStore {
  private readonly col;
  constructor(db: Db) {
    this.col = db.collection<Doc>("alert_records");
  }

  async init(): Promise<void> {
    await this.col.createIndex({ deviceKey: 1, kind: 1, day: 1 }, { unique: true });
    await this.col.createIndex({ acknowledgedAt: 1, lastAt: -1 });
  }

  /** Never throws: losing an alert record must not stop a fiscal job. */
  async record(a: Alert): Promise<void> {
    try {
      const day = a.at.toISOString().slice(0, 10);
      await this.col.updateOne(
        { deviceKey: a.deviceKey, kind: a.kind, day },
        {
          $setOnInsert: { firstAt: a.at, acknowledgedAt: null, acknowledgedBy: null },
          $set: { message: a.message, lastAt: a.at, ...(a.details ? { details: a.details } : {}) },
          $inc: { count: 1 },
        },
        { upsert: true },
      );
    } catch (e) {
      console.error(`alert store: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async list(opts: { unacknowledgedOnly?: boolean; limit?: number } = {}): Promise<StoredAlert[]> {
    const rows = await this.col
      .find(opts.unacknowledgedOnly ? { acknowledgedAt: null } : {})
      .sort({ lastAt: -1 })
      .limit(Math.min(opts.limit ?? 200, 500))
      .toArray();
    return rows.map(({ _id, ...rest }) => ({ id: _id.toHexString(), ...rest }));
  }

  async acknowledge(id: string, by: string): Promise<boolean> {
    if (!/^[a-f0-9]{24}$/.test(id)) return false;
    const r = await this.col.updateOne({ _id: new ObjectId(id), acknowledgedAt: null }, { $set: { acknowledgedAt: new Date(), acknowledgedBy: by } });
    return r.matchedCount === 1;
  }
}
