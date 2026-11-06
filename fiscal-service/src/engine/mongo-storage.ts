import type { Collection } from "mongodb";

import type { Storage } from "../core/storage.js";

interface KvDoc {
  _id: string;
  v: string;
}

/**
 * The core's key-value storage on MongoDB, one namespace per device. Every `set` is a single-document upsert,
 * which MongoDB applies atomically, so a reader never sees half a value (the crash-safety argument of the core).
 */
export class MongoStorage implements Storage {
  constructor(
    private readonly col: Collection<KvDoc>,
    private readonly namespace: string
  ) {}

  private id(key: string): string {
    return `${this.namespace}:${key}`;
  }

  async get(key: string): Promise<string | null> {
    const d = await this.col.findOne({ _id: this.id(key) });
    return d?.v ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.col.updateOne({ _id: this.id(key) }, { $set: { v: value } }, { upsert: true });
  }

  async delete(key: string): Promise<void> {
    await this.col.deleteOne({ _id: this.id(key) });
  }
}
