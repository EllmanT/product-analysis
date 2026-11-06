import assert from "node:assert/strict";
import { test } from "node:test";

import { TransportError, type Transport, type TransportRequest } from "../src/core/transport.js";
import { ChaoticTransport } from "../src/testing/chaotic-transport.js";

const req = (url: string): TransportRequest => ({ method: "POST", url, headers: {}, timeoutMs: 1000 });

function stub() {
  const seen: string[] = [];
  const t: Transport = {
    async request(r) {
      seen.push(r.url);
      return { status: 200, headers: {}, text: "{}" };
    },
  };
  return { t, seen };
}

test("outage stops the call before it leaves", async () => {
  const { t, seen } = stub();
  const c = new ChaoticTransport(t);
  c.faults.outage = true;
  await assert.rejects(c.request(req("https://x/SubmitReceipt")), TransportError);
  assert.equal(seen.length, 0);
  c.faults.outage = false;
  assert.equal((await c.request(req("https://x/SubmitReceipt"))).status, 200);
});

test("a lost reply still reaches the server", async () => {
  const { t, seen } = stub();
  const c = new ChaoticTransport(t);
  c.faults.dropRepliesNext = 1;
  await assert.rejects(c.request(req("https://x/SubmitReceipt")), TransportError);
  assert.equal(seen.length, 1, "the request was delivered; only the answer was lost");
  assert.equal((await c.request(req("https://x/SubmitReceipt"))).status, 200);
  assert.equal(c.counters.repliesDropped, 1);
});

test("a lost request never reaches the server", async () => {
  const { t, seen } = stub();
  const c = new ChaoticTransport(t);
  c.faults.dropRequestRate = 1;
  await assert.rejects(c.request(req("https://x/SubmitReceipt")));
  assert.equal(seen.length, 0);
});

test("`only` leaves other calls alone", async () => {
  const { t } = stub();
  const c = new ChaoticTransport(t);
  c.faults.outage = true;
  c.faults.only = /SubmitReceipt/;
  assert.equal((await c.request(req("https://x/GetStatus"))).status, 200);
  await assert.rejects(c.request(req("https://x/SubmitReceipt")));
});

test("seeded random makes the pattern repeatable", async () => {
  const run = async () => {
    let a = 5;
    const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    const c = new ChaoticTransport(stub().t, rnd);
    c.faults.dropReplyRate = 0.5;
    const out: boolean[] = [];
    for (let i = 0; i < 20; i++) out.push(await c.request(req("https://x/a")).then(() => true, () => false));
    return out.join();
  };
  assert.equal(await run(), await run());
});
