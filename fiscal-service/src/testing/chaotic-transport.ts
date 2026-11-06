/**
 * Wraps any Transport (in practice the real mTLS one) and breaks the connection on purpose, so the engine can be
 * proven against the REAL ZIMRA gateway even though we cannot make ZIMRA itself misbehave:
 *   - outage:       nothing leaves the machine, the call fails like a dead network;
 *   - dropRequest:  the request is lost on the way out (ZIMRA never sees it);
 *   - dropReply:    ZIMRA DOES process the request, but the answer is lost. This is the dangerous one: the engine
 *                   must resend the identical receipt and ZIMRA must answer with the same receiptID, not a second record.
 *   - latency:      fixed + jittered delay before the request goes out.
 * Faults are plain fields, changeable while a run is in progress. `only` limits them to some paths, e.g. receipts.
 */
import { TransportError, type Transport, type TransportRequest, type TransportResponse } from "../core/transport.js";

export interface ChaosFaults {
  outage: boolean;
  dropRequestRate: number;
  dropReplyRate: number;
  /** Lose the replies of the next N calls, whatever the rate. */
  dropRepliesNext: number;
  latencyMs: number;
  jitterMs: number;
  /** Only calls whose URL matches are affected, e.g. /SubmitReceipt/. Everything else passes untouched. */
  only?: RegExp;
}

export interface ChaosCounters {
  calls: number;
  passed: number;
  blockedByOutage: number;
  requestsDropped: number;
  repliesDropped: number;
}

export class ChaoticTransport implements Transport {
  readonly faults: ChaosFaults = { outage: false, dropRequestRate: 0, dropReplyRate: 0, dropRepliesNext: 0, latencyMs: 0, jitterMs: 0 };
  readonly counters: ChaosCounters = { calls: 0, passed: 0, blockedByOutage: 0, requestsDropped: 0, repliesDropped: 0 };

  constructor(
    private readonly inner: Transport,
    private readonly random: () => number = Math.random,
  ) {}

  async request(req: TransportRequest): Promise<TransportResponse> {
    const f = this.faults;
    this.counters.calls++;
    if (f.only && !f.only.test(req.url)) {
      this.counters.passed++;
      return this.inner.request(req);
    }
    if (f.outage) {
      this.counters.blockedByOutage++;
      throw new TransportError("chaos: network outage");
    }
    if (f.latencyMs || f.jitterMs) await new Promise((r) => setTimeout(r, f.latencyMs + this.random() * f.jitterMs));
    if (f.dropRequestRate > 0 && this.random() < f.dropRequestRate) {
      this.counters.requestsDropped++;
      throw new TransportError("chaos: request lost");
    }
    const res = await this.inner.request(req);
    if (f.dropRepliesNext > 0) {
      f.dropRepliesNext--;
      this.counters.repliesDropped++;
      throw new TransportError("chaos: reply lost");
    }
    if (f.dropReplyRate > 0 && this.random() < f.dropReplyRate) {
      this.counters.repliesDropped++;
      throw new TransportError("chaos: reply lost");
    }
    this.counters.passed++;
    return res;
  }
}
